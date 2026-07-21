import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRendererViewModel,
  createInventorySnapshotV1,
  validateInventorySnapshotV1,
  validateLibrarySnapshotV1,
  validateProjectConfigV1,
  validateSiteManifestV1,
} from "./generator-contracts.mjs";
import {
  createCodexGlobalSkillsAdapter,
  createCodexPluginAdapter,
  createNormalizedJsonAdapter,
  createSkillDirectoryAdapter,
  scanInventorySources,
} from "./source-adapters.mjs";
import {
  analyzeInventorySnapshotV1,
  createDefaultAnalysisOverridesV1,
  validateAnalysisReportV1,
  validateAnalysisOverridesV1,
} from "./library-analyzer.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "../..");
const TEMPLATE_DIRECTORIES = Object.freeze({
  "reference-index": "reference-index-v1",
  "silent-orbit": "silent-orbit-v1",
});
const CONFIG_FILE = "silent-orbit.config.json";
const OVERRIDES_FILE = "silent-orbit.overrides.json";
const STATE_DIR = ".silent-orbit";
const INVENTORY_FILE = path.join(STATE_DIR, "inventory.private.json");
const ANALYSIS_REPORT_FILE = path.join(STATE_DIR, "analysis-report.json");
const PREVIOUS_SNAPSHOT_FILE = path.join(STATE_DIR, "previous-snapshot.json");
const LIBRARY_FILE = "library.snapshot.json";
const SITE_MANIFEST_FILE = "site-manifest.json";
const SECRET_PREFIXES = [
  ["github", "pat"].join("_") + "_",
  ["gh", "p_"].join(""),
];

function invariant(condition, message) {
  if (!condition) throw new Error(`Silent Orbit project violation: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function portableSlug(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "my-skill-library";
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWritePath(projectRoot, relativePath, label) {
  invariant(typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath), `${label} must be project-relative.`);
  const target = path.resolve(projectRoot, relativePath);
  invariant(isWithin(projectRoot, target), `${label} escapes the project root.`);
  return target;
}

function readJson(filePath, label) {
  invariant(fs.existsSync(filePath), `${label} is missing.`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Silent Orbit project violation: ${label} is not valid JSON: ${error.message}`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicWriteText(target, text) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  const backup = `${target}.bak-${process.pid}`;
  fs.writeFileSync(temporary, text, "utf8");
  let backedUp = false;
  try {
    if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(temporary, target);
    if (backedUp) fs.rmSync(backup, { force: true });
  } catch (error) {
    if (!fs.existsSync(target) && backedUp && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function atomicWriteJson(target, value) {
  atomicWriteText(target, stableJson(value));
}

function writeReceipt(projectRoot, command, identity, value) {
  const safeIdentity = String(identity).replace(/[^a-z0-9.-]+/gi, "-");
  const target = path.join(projectRoot, STATE_DIR, "receipts", `${command}-${safeIdentity}.json`);
  atomicWriteJson(target, value);
  return target;
}

function contentWithoutSnapshotClock(snapshot) {
  const clone = structuredClone(snapshot);
  delete clone.snapshotId;
  delete clone.generatedAt;
  return JSON.stringify(clone);
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Silent Orbit project violation: generated output cannot contain symbolic links.");
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  visit(root);
  return files;
}

function outputManifest(root) {
  return listFiles(root).map((filePath) => ({
    path: toPosix(path.relative(root, filePath)),
    bytes: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  }));
}

function validateGeneratedDirectory(root) {
  for (const name of ["index.html", "styles.css", "app.js", "site-data.json", "frontend-handoff.md"]) {
    invariant(fs.existsSync(path.join(root, name)), `generated output is missing ${name}.`);
  }
  const payload = listFiles(root).filter((filePath) => /\.(?:html|css|js|json)$/i.test(filePath)).map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  invariant(!/(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i.test(payload), "generated output contains an absolute user path.");
  invariant(!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(payload), "generated output contains an email address.");
  invariant(!SECRET_PREFIXES.some((prefix) => payload.includes(prefix)) && !/bearer\s+[A-Za-z0-9._-]{12,}/i.test(payload), "generated output contains secret-like content.");
  return outputManifest(root);
}

export function createDefaultSilentOrbitConfigV1({ projectId = "my-skill-library", title = "My Skill Library" } = {}) {
  const normalizedProjectId = portableSlug(projectId);
  return {
    schemaVersion: 1,
    project: {
      schemaVersion: 1,
      projectId: normalizedProjectId,
      title: { "en-US": String(title).trim() || "My Skill Library" },
      locales: ["en-US"],
      defaultLocale: "en-US",
      renderer: { theme: "reference-index", defaultRoute: "/" },
      privacy: {
        defaultVisibility: "review-required",
        publicVisibilities: ["public", "creator-showcase"],
        publishRawPaths: false,
        publishHashes: false,
        publishUsageEvidence: false,
      },
    },
    sources: [],
  };
}

export function validateSilentOrbitConfigV1(config) {
  invariant(isRecord(config) && config.schemaVersion === 1, "silent-orbit.config.json must be version 1.");
  const unexpectedRoot = Object.keys(config).filter((key) => !["schemaVersion", "project", "sources"].includes(key));
  invariant(unexpectedRoot.length === 0, `silent-orbit.config.json has unsupported fields: ${unexpectedRoot.join(", ")}.`);
  validateProjectConfigV1(config.project);
  invariant(Array.isArray(config.sources), "silent-orbit.config.json sources must be an array.");
  const allowedTypes = new Set(["skill-folder", "codex-global", "codex-plugin", "json-import"]);
  const keys = [];
  for (const [index, source] of config.sources.entries()) {
    invariant(isRecord(source), `sources[${index}] must be an object.`);
    const unexpected = Object.keys(source).filter((key) => !["key", "type", "label", "path", "sourceUrl", "updateChannel", "maxDepth"].includes(key));
    invariant(unexpected.length === 0, `sources[${index}] has unsupported fields: ${unexpected.join(", ")}.`);
    invariant(typeof source.key === "string" && /^[a-z0-9][a-z0-9._-]*$/i.test(source.key), `sources[${index}] needs a portable key.`);
    invariant(allowedTypes.has(source.type), `sources[${index}] has unsupported type ${source.type}.`);
    invariant(typeof source.label === "string" && source.label.trim().length > 0, `sources[${index}] needs a label.`);
    if (source.type !== "codex-global") invariant(typeof source.path === "string" && source.path.length > 0, `sources[${index}] needs a path.`);
    if (source.maxDepth !== undefined) invariant(Number.isInteger(source.maxDepth) && source.maxDepth >= 0 && source.maxDepth <= 20, `sources[${index}] has invalid maxDepth.`);
    keys.push(source.key);
  }
  invariant(new Set(keys).size === keys.length, "Source keys must be unique.");
  return config;
}

export function resolveProjectRoot(projectDirectory = ".") {
  return path.resolve(projectDirectory);
}

export function loadSilentOrbitProject(projectDirectory = ".") {
  const projectRoot = resolveProjectRoot(projectDirectory);
  const config = validateSilentOrbitConfigV1(readJson(path.join(projectRoot, CONFIG_FILE), CONFIG_FILE));
  const overridesPath = path.join(projectRoot, OVERRIDES_FILE);
  const overrides = validateAnalysisOverridesV1(readJson(overridesPath, OVERRIDES_FILE));
  return { projectRoot, config, overrides };
}

export function initSilentOrbitProject({ projectDirectory = ".", title, projectId } = {}) {
  const projectRoot = resolveProjectRoot(projectDirectory);
  fs.mkdirSync(projectRoot, { recursive: true });
  const configPath = path.join(projectRoot, CONFIG_FILE);
  const overridesPath = path.join(projectRoot, OVERRIDES_FILE);
  invariant(!fs.existsSync(configPath) && !fs.existsSync(overridesPath), "project is already initialized; refusing to overwrite configuration.");
  const config = createDefaultSilentOrbitConfigV1({ projectId: projectId ?? path.basename(projectRoot), title: title ?? path.basename(projectRoot) });
  const overrides = createDefaultAnalysisOverridesV1();
  atomicWriteJson(configPath, config);
  atomicWriteJson(overridesPath, overrides);
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) atomicWriteText(gitignorePath, ".silent-orbit/\n");
  else {
    const current = fs.readFileSync(gitignorePath, "utf8");
    if (!current.split(/\r?\n/).includes(".silent-orbit/")) atomicWriteText(gitignorePath, `${current.replace(/\s*$/, "")}\n.silent-orbit/\n`);
  }
  fs.mkdirSync(path.join(projectRoot, STATE_DIR, "imports"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, STATE_DIR, "receipts"), { recursive: true });
  return { projectRoot, configPath, overridesPath, projectId: config.project.projectId };
}

function resolveReadPath(projectRoot, configuredPath) {
  return path.isAbsolute(configuredPath) ? path.resolve(configuredPath) : path.resolve(projectRoot, configuredPath);
}

function adaptersForProject(projectRoot, config) {
  return config.sources.map((source) => {
    const common = { sourceKey: source.key, label: source.label };
    if (source.type === "skill-folder") return createSkillDirectoryAdapter({ ...common, root: resolveReadPath(projectRoot, source.path), sourceUrl: source.sourceUrl, maxDepth: source.maxDepth, updateChannel: source.updateChannel });
    if (source.type === "codex-global") return createCodexGlobalSkillsAdapter(common);
    if (source.type === "codex-plugin") return createCodexPluginAdapter({ ...common, pluginRoot: resolveReadPath(projectRoot, source.path), maxDepth: source.maxDepth });
    if (source.type === "json-import") return createNormalizedJsonAdapter({ ...common, input: resolveReadPath(projectRoot, source.path) });
    throw new Error(`Silent Orbit project violation: unsupported source type ${source.type}.`);
  });
}

function reuseStableGeneratedAt(projectRoot, nextSnapshot, requestedGeneratedAt) {
  if (requestedGeneratedAt) return requestedGeneratedAt;
  const previousPath = path.join(projectRoot, INVENTORY_FILE);
  if (!fs.existsSync(previousPath)) return nextSnapshot.generatedAt;
  const previous = readJson(previousPath, INVENTORY_FILE);
  try {
    validateInventorySnapshotV1(previous);
    if (contentWithoutSnapshotClock(previous) === contentWithoutSnapshotClock(nextSnapshot)) return previous.generatedAt;
  } catch {
    // A broken previous snapshot is replaced by the newly validated scan.
  }
  return nextSnapshot.generatedAt;
}

export function scanSilentOrbitProject({ projectDirectory = ".", generatedAt } = {}) {
  const { projectRoot, config, overrides } = loadSilentOrbitProject(projectDirectory);
  invariant(config.sources.length > 0, "scan needs at least one configured or imported source.");
  const firstGeneratedAt = generatedAt ?? new Date().toISOString();
  let result = scanInventorySources({
    projectConfig: config.project,
    generatedAt: firstGeneratedAt,
    adapters: adaptersForProject(projectRoot, config),
    governanceOverrides: overrides.governance,
  });
  const stableGeneratedAt = reuseStableGeneratedAt(projectRoot, result.snapshot, generatedAt);
  if (stableGeneratedAt !== firstGeneratedAt) {
    result = {
      ...result,
      snapshot: createInventorySnapshotV1({
        projectId: result.snapshot.projectId,
        generatedAt: stableGeneratedAt,
        sources: result.snapshot.sources,
        items: result.snapshot.items,
        diagnostics: result.snapshot.diagnostics,
      }),
    };
  }
  const inventoryPath = resolveWritePath(projectRoot, INVENTORY_FILE, "inventory output");
  atomicWriteJson(inventoryPath, result.snapshot);
  const receiptPath = writeReceipt(projectRoot, "scan", result.snapshot.snapshotId, {
    schemaVersion: 1,
    command: "scan",
    generatedAt: result.snapshot.generatedAt,
    inventorySnapshotId: result.snapshot.snapshotId,
    summary: result.snapshot.summary,
  });
  return { ...result, projectRoot, inventoryPath, receiptPath };
}

export function importSilentOrbitSource({ projectDirectory = ".", inputFile } = {}) {
  invariant(typeof inputFile === "string" && inputFile.length > 0, "import requires --file <SourceImportV1 JSON>.");
  const { projectRoot, config, overrides } = loadSilentOrbitProject(projectDirectory);
  const absoluteInput = path.resolve(inputFile);
  const input = readJson(absoluteInput, "import file");
  const probe = scanInventorySources({
    projectConfig: config.project,
    generatedAt: "2000-01-01T00:00:00.000Z",
    adapters: [createNormalizedJsonAdapter({ input })],
    governanceOverrides: overrides.governance,
  });
  invariant(probe.snapshot.sources[0]?.scanState !== "failed", `import failed validation: ${probe.snapshot.diagnostics.map((entry) => entry.code).join(", ")}.`);
  const sourceKey = input.source.key;
  const sourceDigest = createHash("sha256").update(sourceKey).digest("hex").slice(0, 10);
  const relativeImportPath = toPosix(path.join(STATE_DIR, "imports", `${portableSlug(sourceKey)}-${sourceDigest}.json`));
  const target = resolveWritePath(projectRoot, relativeImportPath, "import target");
  atomicWriteJson(target, input);
  const source = {
    key: sourceKey,
    type: "json-import",
    label: input.source.label,
    path: relativeImportPath,
    ...(input.source.sourceUrl ? { sourceUrl: input.source.sourceUrl } : {}),
    ...(input.source.updateChannel ? { updateChannel: input.source.updateChannel } : {}),
  };
  const existing = config.sources.findIndex((candidate) => candidate.key === sourceKey);
  if (existing >= 0) config.sources[existing] = source;
  else config.sources.push(source);
  config.sources.sort((left, right) => left.key.localeCompare(right.key, "en"));
  atomicWriteJson(path.join(projectRoot, CONFIG_FILE), config);
  return { projectRoot, sourceKey, importedTo: target, sourceCount: config.sources.length };
}

function replaceJsonBundleAtomically(projectRoot, entries, transactionId) {
  const transactionRoot = path.join(projectRoot, STATE_DIR, "transactions", `files-${transactionId.replace(/[^a-z0-9.-]+/gi, "-")}`);
  const stagedRoot = path.join(transactionRoot, "staged");
  const backupRoot = path.join(transactionRoot, "backup");
  invariant(isWithin(projectRoot, transactionRoot), "file transaction escaped the project root.");
  if (fs.existsSync(transactionRoot)) fs.rmSync(transactionRoot, { recursive: true, force: true });
  const records = entries.map((entry) => {
    const target = resolveWritePath(projectRoot, entry.relativePath, `transaction target ${entry.relativePath}`);
    const staged = path.join(stagedRoot, entry.relativePath);
    const backup = path.join(backupRoot, entry.relativePath);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, stableJson(entry.value), "utf8");
    return { target, staged, backup };
  });
  const replaced = [];
  try {
    for (const record of records) {
      let backedUp = false;
      if (fs.existsSync(record.target)) {
        fs.mkdirSync(path.dirname(record.backup), { recursive: true });
        fs.renameSync(record.target, record.backup);
        backedUp = true;
      }
      fs.mkdirSync(path.dirname(record.target), { recursive: true });
      fs.renameSync(record.staged, record.target);
      replaced.push({ ...record, backedUp });
    }
    fs.rmSync(transactionRoot, { recursive: true, force: true });
  } catch (error) {
    for (const record of [...replaced].reverse()) {
      if (fs.existsSync(record.target)) fs.rmSync(record.target, { force: true });
      if (record.backedUp && fs.existsSync(record.backup)) {
        fs.mkdirSync(path.dirname(record.target), { recursive: true });
        fs.renameSync(record.backup, record.target);
      }
    }
    for (const record of records) {
      if (!fs.existsSync(record.target) && fs.existsSync(record.backup)) {
        fs.mkdirSync(path.dirname(record.target), { recursive: true });
        fs.renameSync(record.backup, record.target);
      }
    }
    throw error;
  } finally {
    if (fs.existsSync(transactionRoot)) fs.rmSync(transactionRoot, { recursive: true, force: true });
  }
}

export function analyzeSilentOrbitProject({ projectDirectory = "." } = {}) {
  const { projectRoot, config, overrides } = loadSilentOrbitProject(projectDirectory);
  const inventoryPath = path.join(projectRoot, INVENTORY_FILE);
  const inventorySnapshot = validateInventorySnapshotV1(readJson(inventoryPath, INVENTORY_FILE));
  const result = analyzeInventorySnapshotV1({ projectConfig: config.project, inventorySnapshot, analysisOverrides: overrides });
  replaceJsonBundleAtomically(projectRoot, [
    { relativePath: LIBRARY_FILE, value: result.librarySnapshot },
    { relativePath: SITE_MANIFEST_FILE, value: result.siteManifest },
    { relativePath: ANALYSIS_REPORT_FILE, value: result.analysisReport },
  ], result.librarySnapshot.snapshotId);
  const receiptPath = writeReceipt(projectRoot, "analyze", result.librarySnapshot.snapshotId, {
    schemaVersion: 1,
    command: "analyze",
    generatedAt: result.librarySnapshot.generatedAt,
    inventorySnapshotId: inventorySnapshot.snapshotId,
    librarySnapshotId: result.librarySnapshot.snapshotId,
    analysisReportId: result.analysisReport.reportId,
    summary: result.analysisReport.summary,
  });
  return { ...result, projectRoot, receiptPath };
}

function recordById(records) {
  return new Map(records.map((record) => [record.id, record]));
}

export function diffLibrarySnapshots(previous, current) {
  validateLibrarySnapshotV1(previous);
  validateLibrarySnapshotV1(current);
  const previousById = recordById(previous.skills);
  const currentById = recordById(current.skills);
  const added = current.skills.filter((skill) => !previousById.has(skill.id)).map((skill) => skill.name).sort();
  const removed = previous.skills.filter((skill) => !currentById.has(skill.id)).map((skill) => skill.name).sort();
  const changed = current.skills.filter((skill) => previousById.has(skill.id) && JSON.stringify(previousById.get(skill.id)) !== JSON.stringify(skill)).map((skill) => skill.name).sort();
  return {
    schemaVersion: 1,
    previousSnapshotId: previous.snapshotId,
    currentSnapshotId: current.snapshotId,
    added,
    changed,
    removed,
    summary: { added: added.length, changed: changed.length, removed: removed.length },
  };
}

export function diffSilentOrbitProject({ projectDirectory = "." } = {}) {
  const { projectRoot } = loadSilentOrbitProject(projectDirectory);
  const current = validateLibrarySnapshotV1(readJson(path.join(projectRoot, LIBRARY_FILE), LIBRARY_FILE));
  const previousPath = path.join(projectRoot, PREVIOUS_SNAPSHOT_FILE);
  if (!fs.existsSync(previousPath)) {
    return {
      schemaVersion: 1,
      previousSnapshotId: null,
      currentSnapshotId: current.snapshotId,
      added: current.skills.map((skill) => skill.name).sort(),
      changed: [],
      removed: [],
      summary: { added: current.skills.length, changed: 0, removed: 0 },
    };
  }
  return diffLibrarySnapshots(readJson(previousPath, PREVIOUS_SNAPSHOT_FILE), current);
}

function templateRootFor(theme) {
  const directory = TEMPLATE_DIRECTORIES[theme];
  invariant(directory, `unsupported renderer theme ${theme}.`);
  return path.join(packageRoot, "templates", directory);
}

function copyTemplate(target, theme) {
  const templateRoot = templateRootFor(theme);
  invariant(fs.existsSync(templateRoot), "bundled renderer template is missing.");
  fs.mkdirSync(target, { recursive: true });
  for (const name of ["index.html", "styles.css", "app.js"]) fs.copyFileSync(path.join(templateRoot, name), path.join(target, name));
}

function frontendHandoff({ theme, summary }) {
  return [
    "# Frontend handoff",
    "",
    "This directory is a functional reference preview, not a prescribed art direction.",
    "Use your preferred frontend Skill and visual style to create a custom implementation from the public data contract.",
    "",
    "## Public inputs",
    "",
    "- `site-data.json`: runtime-safe project, SiteManifestV1, and renderer view model.",
    "- `site-data.json.project.renderer`: renderer identifier and default route.",
    "- Do not read `.silent-orbit/`, installed Skill bodies, local paths, usage evidence, or private maintenance state.",
    "",
    "## Required behavior",
    "",
    "- Preserve search, category/source filtering, Map and Library navigation, Skill detail, keyboard access, and mobile interaction.",
    "- Keep public counts derived from the supplied membership data.",
    "- Preserve `public` and `creator-showcase` records only; never invent publication approval.",
    "- Build into a user-selected output directory and do not overwrite this reference preview without confirmation.",
    "",
    `Reference renderer: ${theme}`,
    `Reviewed public Skills: ${summary.skills}`,
    "",
  ].join("\n");
}

function replaceDirectoryAtomically(projectRoot, temporary, target, snapshotId) {
  const transactionRoot = path.join(projectRoot, STATE_DIR, "transactions");
  fs.mkdirSync(transactionRoot, { recursive: true });
  const backup = path.join(transactionRoot, `dist-backup-${snapshotId.replace(/[^a-z0-9.-]+/gi, "-")}`);
  invariant(isWithin(projectRoot, temporary) && isWithin(projectRoot, target) && isWithin(projectRoot, backup), "generated directory replacement escaped the project root.");
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  let backedUp = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(temporary, target);
    if (backedUp) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(target) && backedUp && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
}

export function generateSilentOrbitProject({ projectDirectory = "." } = {}) {
  const { projectRoot, config } = loadSilentOrbitProject(projectDirectory);
  const inventorySnapshot = validateInventorySnapshotV1(readJson(path.join(projectRoot, INVENTORY_FILE), INVENTORY_FILE));
  const librarySnapshot = validateLibrarySnapshotV1(readJson(path.join(projectRoot, LIBRARY_FILE), LIBRARY_FILE));
  const siteManifest = validateSiteManifestV1(readJson(path.join(projectRoot, SITE_MANIFEST_FILE), SITE_MANIFEST_FILE), { projectConfig: config.project, inventorySnapshot, librarySnapshot });
  const appData = buildRendererViewModel({ librarySnapshot, generatedAt: librarySnapshot.generatedAt, sourceDir: LIBRARY_FILE });
  const temporary = path.join(projectRoot, `${STATE_DIR}-generate-${process.pid}`);
  const target = path.join(projectRoot, "dist");
  invariant(isWithin(projectRoot, temporary) && temporary !== projectRoot, "temporary output escaped the project root.");
  if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
  try {
    copyTemplate(temporary, config.project.renderer.theme);
    atomicWriteJson(path.join(temporary, "site-data.json"), { project: config.project, siteManifest, appData });
    atomicWriteText(path.join(temporary, "frontend-handoff.md"), frontendHandoff({ theme: config.project.renderer.theme, summary: siteManifest.summary }));
    const files = validateGeneratedDirectory(temporary);
    replaceDirectoryAtomically(projectRoot, temporary, target, librarySnapshot.snapshotId);
    replaceJsonBundleAtomically(projectRoot, [
      { relativePath: PREVIOUS_SNAPSHOT_FILE, value: librarySnapshot },
    ], `generated-${librarySnapshot.snapshotId}`);
    const receipt = {
      schemaVersion: 1,
      command: "generate",
      generatedAt: librarySnapshot.generatedAt,
      inventorySnapshotId: inventorySnapshot.snapshotId,
      librarySnapshotId: librarySnapshot.snapshotId,
      siteManifestId: createHash("sha256").update(JSON.stringify(siteManifest)).digest("hex"),
      files,
    };
    const receiptPath = writeReceipt(projectRoot, "generate", librarySnapshot.snapshotId, receipt);
    return { projectRoot, outputDirectory: target, receipt, receiptPath, summary: siteManifest.summary };
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function doctorSilentOrbitProject({ projectDirectory = "." } = {}) {
  const checks = [];
  let project;
  try {
    project = loadSilentOrbitProject(projectDirectory);
    checks.push({ id: "config", state: "pass", message: "Configuration and overrides are valid." });
  } catch (error) {
    return { schemaVersion: 1, status: "error", checks: [{ id: "config", state: "error", message: error.message }] };
  }
  const { projectRoot, config } = project;
  for (const source of config.sources) {
    if (source.type === "codex-global") {
      checks.push({ id: `source:${source.key}`, state: "unchecked", message: "Provider command health is checked by scan." });
      continue;
    }
    const target = resolveReadPath(projectRoot, source.path);
    checks.push({ id: `source:${source.key}`, state: fs.existsSync(target) ? "pass" : "error", message: fs.existsSync(target) ? "Configured source is readable." : "Configured source is missing." });
  }
  for (const [id, relativePath, validator] of [
    ["inventory", INVENTORY_FILE, validateInventorySnapshotV1],
    ["library", LIBRARY_FILE, validateLibrarySnapshotV1],
    ["analysis-report", ANALYSIS_REPORT_FILE, validateAnalysisReportV1],
  ]) {
    const target = path.join(projectRoot, relativePath);
    if (!fs.existsSync(target)) checks.push({ id, state: "missing", message: `${relativePath} has not been generated.` });
    else {
      try {
        validator(readJson(target, relativePath));
        checks.push({ id, state: "pass", message: `${relativePath} is valid.` });
      } catch (error) {
        checks.push({ id, state: "error", message: error.message });
      }
    }
  }
  const manifestPath = path.join(projectRoot, SITE_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) checks.push({ id: "site-manifest", state: "missing", message: `${SITE_MANIFEST_FILE} has not been generated.` });
  else {
    try {
      const inventory = validateInventorySnapshotV1(readJson(path.join(projectRoot, INVENTORY_FILE), INVENTORY_FILE));
      const library = validateLibrarySnapshotV1(readJson(path.join(projectRoot, LIBRARY_FILE), LIBRARY_FILE));
      validateSiteManifestV1(readJson(manifestPath, SITE_MANIFEST_FILE), { projectConfig: config.project, inventorySnapshot: inventory, librarySnapshot: library });
      checks.push({ id: "site-manifest", state: "pass", message: `${SITE_MANIFEST_FILE} is current.` });
    } catch (error) {
      checks.push({ id: "site-manifest", state: "error", message: error.message });
    }
  }
  const dist = path.join(projectRoot, "dist");
  if (!fs.existsSync(dist)) checks.push({ id: "dist", state: "missing", message: "dist has not been generated." });
  else {
    try {
      const files = validateGeneratedDirectory(dist);
      checks.push({ id: "dist", state: "pass", message: `${files.length} generated files passed privacy validation.` });
    } catch (error) {
      checks.push({ id: "dist", state: "error", message: error.message });
    }
  }
  const status = checks.some((check) => check.state === "error") ? "error" : checks.some((check) => ["missing", "unchecked"].includes(check.state)) ? "attention" : "ok";
  return { schemaVersion: 1, status, checks };
}

export const silentOrbitProjectFiles = Object.freeze({
  config: CONFIG_FILE,
  overrides: OVERRIDES_FILE,
  inventory: INVENTORY_FILE,
  analysisReport: ANALYSIS_REPORT_FILE,
  previousSnapshot: PREVIOUS_SNAPSHOT_FILE,
  library: LIBRARY_FILE,
  siteManifest: SITE_MANIFEST_FILE,
});
