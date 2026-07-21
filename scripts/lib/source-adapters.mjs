import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createContentId,
  createInventorySnapshotV1,
  createSkillId,
  createSourceId,
  validateProjectConfigV1,
} from "./generator-contracts.mjs";

const ORIGINS = new Set(["third-party", "creator", "system", "unknown"]);
const VISIBILITIES = new Set(["public", "creator-showcase", "local-only", "review-required"]);
const STATES = new Set(["present", "missing", "unknown"]);
const UPDATE_CHANNELS = new Set(["source-managed", "external", "system-managed", "unknown"]);
const IGNORED_DIRECTORIES = new Set([".git", ".public-release", ".skills-library-maintenance", "build", "dist", "node_modules"]);
const SECRET_PREFIXES = [
  ["github", "pat"].join("_") + "_",
  ["gh", "p_"].join(""),
];
const LONG_SECRET_PATTERN = new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9_-]{12,}`, "i");
const PRIVATE_VALUE_PATTERNS = [
  /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i,
  /bearer\s+[A-Za-z0-9._-]{12,}/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

function invariant(condition, message) {
  if (!condition) throw new Error(`Source adapter violation: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(record, keys) {
  return Object.keys(record).every((key) => keys.has(key));
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function portableBasename(value) {
  return String(value ?? "").replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "";
}

function normalizeWhitespace(value, maximumLength = 2000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").replace(/\s*\n\s*/g, " ").trim().slice(0, maximumLength);
}

function containsPrivateEvidence(value) {
  const text = String(value);
  return SECRET_PREFIXES.some((prefix) => text.includes(prefix)) || LONG_SECRET_PATTERN.test(text) || PRIVATE_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

function safeSourceKey(value) {
  const key = normalizeWhitespace(value, 160);
  invariant(key.length > 0, "sourceKey is required and must not be derived from an absolute path.");
  invariant(!/[\\/]/.test(key) && !containsPrivateEvidence(key), `sourceKey ${JSON.stringify(key)} is not portable.`);
  return key;
}

function safeSkillName(value, fallback, diagnostics) {
  const candidate = normalizeWhitespace(value || fallback, 160);
  if (candidate && !/[\\/]/.test(candidate) && !containsPrivateEvidence(candidate)) return candidate;
  const fallbackName = normalizeWhitespace(fallback, 160);
  if (fallbackName && !/[\\/]/.test(fallbackName) && !containsPrivateEvidence(fallbackName)) {
    diagnostics.push({ severity: "warning", code: "invalid-skill-name", message: "A non-portable Skill name was replaced with its directory or provider name.", itemName: fallbackName });
    return fallbackName;
  }
  diagnostics.push({ severity: "error", code: "missing-skill-name", message: "A Skill entry was skipped because it had no portable name." });
  return undefined;
}

function safeMetadata(value, field, itemName, diagnostics, maximumLength = 2000) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeWhitespace(value, maximumLength);
  if (!normalized) return undefined;
  if (containsPrivateEvidence(normalized)) {
    diagnostics.push({
      severity: "warning",
      code: "unsafe-metadata-omitted",
      message: `Unsafe ${field} metadata was omitted from a sanitized Skill record.`,
      itemName,
    });
    return undefined;
  }
  return normalized;
}

function safeHttpUrl(value, field, itemName, diagnostics) {
  if (value === undefined || value === null || value === "") return undefined;
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("not public http(s)");
    return url.toString();
  } catch {
    diagnostics.push({
      severity: "warning",
      code: "unsafe-url-omitted",
      message: `A non-public ${field} URL was omitted from a sanitized record.`,
      ...(itemName ? { itemName } : {}),
    });
    return undefined;
  }
}

export function parseSkillFrontmatter(source) {
  const normalized = String(source ?? "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return {};
  const lines = match[1].split("\n");
  const result = {};
  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    if (rawValue === "|" || rawValue === ">") {
      const block = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) block.push(lines[++index].trim());
      result[key] = block.join(rawValue === ">" ? " " : "\n").trim();
    } else {
      result[key] = rawValue.replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return result;
}

function observedFromMarkdown({ markdown, fallbackName, inherited = {}, diagnostics }) {
  const metadata = parseSkillFrontmatter(markdown);
  const name = safeSkillName(metadata.name, fallbackName, diagnostics);
  if (!name) return undefined;
  const observed = compactRecord({
    description: safeMetadata(metadata.description ?? inherited.description, "description", name, diagnostics),
    trigger: safeMetadata(metadata.trigger ?? inherited.trigger, "trigger", name, diagnostics, 300),
    version: safeMetadata(metadata.version ?? inherited.version, "version", name, diagnostics, 120),
    author: safeMetadata(metadata.author ?? inherited.author, "author", name, diagnostics, 200),
    sourceUrl: safeHttpUrl(metadata.repository ?? metadata.homepage ?? metadata.source_url ?? inherited.sourceUrl, "source", name, diagnostics),
  });
  return { name, observed };
}

function scanStateFor(diagnostics, failed = false) {
  if (failed) return "failed";
  return diagnostics.length > 0 ? "partial" : "complete";
}

function createSourceResult({ sourceKey, providerKind, label, sourceUrl, updateChannel, items = [], diagnostics = [], failed = false }) {
  return {
    sourceKey: safeSourceKey(sourceKey),
    providerKind: normalizeWhitespace(providerKind, 120) || "unknown",
    label: normalizeWhitespace(label, 200) || "Skill Source",
    sourceUrl,
    updateChannel: UPDATE_CHANNELS.has(updateChannel) ? updateChannel : "unknown",
    scanState: scanStateFor(diagnostics, failed),
    items,
    diagnostics,
  };
}

function listSkillMarkdownFiles(root, { maxDepth = 4 } = {}) {
  const files = [];
  const diagnostics = [];
  const visit = (directory, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"));
    } catch {
      diagnostics.push({ severity: "error", code: "directory-unreadable", message: "A configured Skill directory could not be read." });
      return;
    }
    const skillFile = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === "skill.md");
    if (skillFile) files.push(path.join(directory, skillFile.name));
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      visit(path.join(directory, entry.name), depth + 1);
    }
  };
  visit(root, 0);
  return { files, diagnostics };
}

function readSkillFile(skillFile, diagnostics, inherited = {}) {
  try {
    const markdown = fs.readFileSync(skillFile, "utf8");
    return observedFromMarkdown({ markdown, fallbackName: path.basename(path.dirname(skillFile)), inherited, diagnostics });
  } catch {
    diagnostics.push({ severity: "error", code: "skill-file-unreadable", message: "A discovered SKILL.md file could not be read." });
    return undefined;
  }
}

export function createSkillDirectoryAdapter({ sourceKey, root, label = "Skill Directory", sourceUrl, maxDepth = 4, updateChannel = "unknown" }) {
  const portableKey = safeSourceKey(sourceKey);
  return {
    adapterKind: "skill-directory",
    sourceKey: portableKey,
    label,
    scan() {
      const diagnostics = [];
      const publicSourceUrl = safeHttpUrl(sourceUrl, "source", undefined, diagnostics);
      if (!root || !fs.existsSync(root) || !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) {
        diagnostics.push({ severity: "error", code: "source-unavailable", message: "The configured Skill directory is missing, invalid, or a symbolic link." });
        return createSourceResult({ sourceKey: portableKey, providerKind: "skill-directory", label, sourceUrl: publicSourceUrl, updateChannel, diagnostics, failed: true });
      }
      const discovery = listSkillMarkdownFiles(path.resolve(root), { maxDepth });
      diagnostics.push(...discovery.diagnostics);
      const items = discovery.files.map((file) => readSkillFile(file, diagnostics)).filter(Boolean).map((record) => ({ ...record, state: "present" }));
      if (items.length === 0 && diagnostics.length === 0) diagnostics.push({ severity: "warning", code: "no-skills-found", message: "The configured directory contained no SKILL.md files." });
      return createSourceResult({ sourceKey: portableKey, providerKind: "skill-directory", label, sourceUrl: publicSourceUrl, updateChannel, items, diagnostics });
    },
  };
}

function commandInvocation(name, args) {
  if (process.platform === "win32" && name === "npx") {
    const cliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
    if (fs.existsSync(cliPath)) return { command: process.execPath, args: [cliPath, ...args] };
  }
  return { command: name, args };
}

function loadCodexGlobalEntries(commandRunner) {
  if (commandRunner) return commandRunner();
  const invocation = commandInvocation("npx", ["skills", "list", "-g", "-a", "codex", "--json"]);
  const result = spawnSync(invocation.command, invocation.args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || "Codex global Skill discovery failed.");
  return JSON.parse(result.stdout);
}

function markdownForGlobalEntry(entry) {
  if (typeof entry.skillMarkdown === "string") return entry.skillMarkdown;
  if (!entry.path) return undefined;
  const candidate = fs.existsSync(entry.path) && fs.statSync(entry.path).isFile() ? entry.path : path.join(entry.path, "SKILL.md");
  return fs.existsSync(candidate) ? fs.readFileSync(candidate, "utf8") : undefined;
}

export function createCodexGlobalSkillsAdapter({ sourceKey = "codex-global", label = "Codex Global Skills", entries, commandRunner } = {}) {
  const portableKey = safeSourceKey(sourceKey);
  return {
    adapterKind: "codex-global",
    sourceKey: portableKey,
    label,
    scan() {
      const diagnostics = [];
      let liveEntries;
      try {
        liveEntries = entries ?? loadCodexGlobalEntries(commandRunner);
      } catch {
        diagnostics.push({ severity: "error", code: "provider-command-failed", message: "Codex global Skill discovery failed without exposing raw command output." });
        return createSourceResult({ sourceKey: portableKey, providerKind: "codex-global", label, updateChannel: "source-managed", diagnostics, failed: true });
      }
      if (!Array.isArray(liveEntries)) {
        diagnostics.push({ severity: "error", code: "provider-output-invalid", message: "Codex global Skill discovery returned an unsupported JSON shape." });
        return createSourceResult({ sourceKey: portableKey, providerKind: "codex-global", label, updateChannel: "source-managed", diagnostics, failed: true });
      }
      const items = [];
      for (const entry of liveEntries) {
        if (!isRecord(entry)) {
          diagnostics.push({ severity: "warning", code: "provider-entry-invalid", message: "A malformed Codex global Skill entry was skipped." });
          continue;
        }
        const fallbackName = normalizeWhitespace(entry.name || portableBasename(entry.path), 160);
        let markdown;
        try {
          markdown = markdownForGlobalEntry(entry);
        } catch {
          markdown = undefined;
        }
        if (!markdown) {
          const name = safeSkillName(entry.name, fallbackName, diagnostics);
          if (name) {
            diagnostics.push({ severity: "warning", code: "skill-file-missing", message: "A listed global Skill had no readable SKILL.md file.", itemName: name });
            items.push({ name, observed: {}, state: "unknown", origin: entry.scope === "system" ? "system" : "unknown", status: safeMetadata(entry.scope, "status", name, diagnostics, 80) });
          }
          continue;
        }
        const record = observedFromMarkdown({ markdown, fallbackName, diagnostics });
        if (record) items.push({ ...record, state: "present", origin: entry.scope === "system" ? "system" : "unknown", status: safeMetadata(entry.scope, "status", record.name, diagnostics, 80) });
      }
      return createSourceResult({ sourceKey: portableKey, providerKind: "codex-global", label, updateChannel: "source-managed", items, diagnostics });
    },
  };
}

function readPluginManifest(pluginRoot) {
  for (const relative of [path.join(".claude-plugin", "plugin.json"), "plugin.json"]) {
    const candidate = path.join(pluginRoot, relative);
    if (!fs.existsSync(candidate)) continue;
    return JSON.parse(fs.readFileSync(candidate, "utf8"));
  }
  return undefined;
}

function repositoryUrl(manifest) {
  if (typeof manifest?.repository === "string") return manifest.repository;
  if (isRecord(manifest?.repository)) return manifest.repository.url;
  return manifest?.homepage;
}

function pluginSkillFiles(pluginRoot, manifest, diagnostics, maxDepth) {
  const candidates = new Set();
  const addCandidate = (relativeValue) => {
    const relative = typeof relativeValue === "string" ? relativeValue : relativeValue?.path;
    if (!relative) return;
    const target = path.resolve(pluginRoot, relative);
    const base = path.resolve(pluginRoot);
    if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
      diagnostics.push({ severity: "error", code: "plugin-path-escape", message: "A plugin Skill path escaped the configured plugin root and was ignored." });
      return;
    }
    if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) {
      diagnostics.push({ severity: "warning", code: "plugin-skill-missing", message: "A plugin manifest referenced a missing or linked Skill path." });
      return;
    }
    if (fs.statSync(target).isFile()) candidates.add(target);
    else {
      const discovery = listSkillMarkdownFiles(target, { maxDepth });
      diagnostics.push(...discovery.diagnostics);
      discovery.files.forEach((file) => candidates.add(file));
    }
  };
  if (Array.isArray(manifest?.skills)) manifest.skills.forEach(addCandidate);
  const conventionalRoot = path.join(pluginRoot, "skills");
  if (fs.existsSync(conventionalRoot) && fs.statSync(conventionalRoot).isDirectory() && !fs.lstatSync(conventionalRoot).isSymbolicLink()) {
    const discovery = listSkillMarkdownFiles(conventionalRoot, { maxDepth });
    diagnostics.push(...discovery.diagnostics);
    discovery.files.forEach((file) => candidates.add(file));
  }
  return [...candidates].sort((left, right) => left.localeCompare(right, "en"));
}

export function createCodexPluginAdapter({ sourceKey, pluginRoot, label, maxDepth = 4 }) {
  const portableKey = safeSourceKey(sourceKey);
  return {
    adapterKind: "codex-plugin",
    sourceKey: portableKey,
    label: label ?? portableKey,
    scan() {
      const diagnostics = [];
      if (!pluginRoot || !fs.existsSync(pluginRoot) || !fs.lstatSync(pluginRoot).isDirectory() || fs.lstatSync(pluginRoot).isSymbolicLink()) {
        diagnostics.push({ severity: "error", code: "source-unavailable", message: "The configured plugin root is missing, invalid, or a symbolic link." });
        return createSourceResult({ sourceKey: portableKey, providerKind: "codex-plugin", label: label ?? portableKey, updateChannel: "external", diagnostics, failed: true });
      }
      let manifest;
      try {
        manifest = readPluginManifest(pluginRoot);
      } catch {
        diagnostics.push({ severity: "error", code: "plugin-manifest-invalid", message: "The plugin manifest is not valid JSON." });
        return createSourceResult({ sourceKey: portableKey, providerKind: "codex-plugin", label: label ?? portableKey, updateChannel: "external", diagnostics, failed: true });
      }
      if (!manifest) diagnostics.push({ severity: "warning", code: "plugin-manifest-missing", message: "No plugin.json manifest was found; conventional Skill directories were scanned." });
      const inherited = {
        description: manifest?.description,
        version: manifest?.version,
        author: isRecord(manifest?.author) ? manifest.author.name : manifest?.author,
        sourceUrl: repositoryUrl(manifest),
      };
      const sourceLabel = label ?? manifest?.displayName ?? manifest?.name ?? portableKey;
      const publicSourceUrl = safeHttpUrl(inherited.sourceUrl, "source", undefined, diagnostics);
      const items = pluginSkillFiles(path.resolve(pluginRoot), manifest, diagnostics, maxDepth)
        .map((file) => readSkillFile(file, diagnostics, inherited))
        .filter(Boolean)
        .map((record) => ({ ...record, state: "present", origin: "unknown" }));
      if (items.length === 0 && !diagnostics.some((entry) => entry.severity === "error")) diagnostics.push({ severity: "warning", code: "no-skills-found", message: "The configured plugin contained no readable SKILL.md files." });
      return createSourceResult({ sourceKey: portableKey, providerKind: "codex-plugin", label: sourceLabel, sourceUrl: publicSourceUrl, updateChannel: "external", items, diagnostics });
    },
  };
}

function loadNormalizedImport(input) {
  if (isRecord(input)) return structuredClone(input);
  invariant(typeof input === "string" && input.length > 0, "normalized JSON adapter needs an object or JSON file path.");
  return JSON.parse(fs.readFileSync(input, "utf8"));
}

function isSourceImportV1(data) {
  const rootKeys = new Set(["schemaVersion", "source", "skills"]);
  const sourceKeys = new Set(["key", "label", "providerKind", "sourceUrl", "updateChannel"]);
  const skillKeys = new Set(["name", "state", "origin", "visibility", "status", "description", "trigger", "version", "author", "sourceUrl"]);
  if (!isRecord(data) || data.schemaVersion !== 1 || !hasOnlyKeys(data, rootKeys)) return false;
  if (!isRecord(data.source) || !hasOnlyKeys(data.source, sourceKeys)) return false;
  if (typeof data.source.key !== "string" || !data.source.key.trim() || typeof data.source.label !== "string" || !data.source.label.trim()) return false;
  if (!Array.isArray(data.skills)) return false;
  return data.skills.every((skill) => isRecord(skill)
    && hasOnlyKeys(skill, skillKeys)
    && typeof skill.name === "string"
    && skill.name.trim().length > 0
    && (skill.state === undefined || STATES.has(skill.state))
    && (skill.origin === undefined || ORIGINS.has(skill.origin))
    && (skill.visibility === undefined || VISIBILITIES.has(skill.visibility)));
}

export function createNormalizedJsonAdapter({ input, sourceKey, label } = {}) {
  const fallbackKey = safeSourceKey(sourceKey ?? "normalized-import");
  return {
    adapterKind: "normalized-json",
    sourceKey: fallbackKey,
    label: label ?? "Normalized JSON Import",
    scan() {
      const diagnostics = [];
      let data;
      try {
        data = loadNormalizedImport(input);
      } catch {
        diagnostics.push({ severity: "error", code: "import-invalid-json", message: "The normalized import could not be parsed as JSON." });
        return createSourceResult({ sourceKey: fallbackKey, providerKind: "normalized-json", label: label ?? "Normalized JSON Import", updateChannel: "unknown", diagnostics, failed: true });
      }
      if (!isSourceImportV1(data)) {
        diagnostics.push({ severity: "error", code: "import-contract-invalid", message: "The normalized import does not match SourceImportV1." });
        return createSourceResult({ sourceKey: fallbackKey, providerKind: "normalized-json", label: label ?? "Normalized JSON Import", updateChannel: "unknown", diagnostics, failed: true });
      }
      const importedKey = safeSourceKey(sourceKey ?? data.source.key ?? fallbackKey);
      const sourceLabel = label ?? data.source.label ?? "Normalized JSON Import";
      const publicSourceUrl = safeHttpUrl(data.source.sourceUrl, "source", undefined, diagnostics);
      const items = [];
      for (const value of data.skills) {
        if (!isRecord(value)) {
          diagnostics.push({ severity: "warning", code: "import-entry-invalid", message: "A malformed normalized Skill record was skipped." });
          continue;
        }
        const name = safeSkillName(value.name, undefined, diagnostics);
        if (!name) continue;
        const observed = compactRecord({
          description: safeMetadata(value.description, "description", name, diagnostics),
          trigger: safeMetadata(value.trigger, "trigger", name, diagnostics, 300),
          version: safeMetadata(value.version, "version", name, diagnostics, 120),
          author: safeMetadata(value.author, "author", name, diagnostics, 200),
          sourceUrl: safeHttpUrl(value.sourceUrl, "source", name, diagnostics),
        });
        items.push({
          name,
          observed,
          state: STATES.has(value.state) ? value.state : "present",
          origin: ORIGINS.has(value.origin) ? value.origin : "unknown",
          visibility: VISIBILITIES.has(value.visibility) ? value.visibility : undefined,
          status: safeMetadata(value.status, "status", name, diagnostics, 120),
        });
      }
      return createSourceResult({
        sourceKey: importedKey,
        providerKind: normalizeWhitespace(data.source.providerKind, 120) || "normalized-json",
        label: sourceLabel,
        sourceUrl: publicSourceUrl,
        updateChannel: data.source.updateChannel,
        items,
        diagnostics,
      });
    },
  };
}

function canonicalChoice(records) {
  return [...records].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"))[0];
}

function diagnosticRecord({ sourceId, itemId, severity, code, message }) {
  const publicMessage = containsPrivateEvidence(message) ? "A source diagnostic was redacted because it contained private evidence." : normalizeWhitespace(message, 500);
  return compactRecord({
    id: createContentId("diagnostic", `${sourceId}\u0000${itemId ?? ""}\u0000${severity}\u0000${code}\u0000${publicMessage}`),
    sourceId,
    itemId,
    severity,
    code,
    message: publicMessage,
  });
}

export function scanInventorySources({ projectConfig, generatedAt, adapters, governanceOverrides = [] }) {
  validateProjectConfigV1(projectConfig);
  invariant(typeof generatedAt === "string" && !Number.isNaN(Date.parse(generatedAt)), "generatedAt must be an explicit ISO timestamp.");
  invariant(Array.isArray(adapters) && adapters.length > 0, "at least one source adapter is required.");
  const overrideByKey = new Map(governanceOverrides.map((entry) => [`${safeSourceKey(entry.sourceKey)}\u0000${entry.name}`, entry]));
  const sourceResults = adapters.map((adapter) => {
    try {
      return adapter.scan();
    } catch {
      return createSourceResult({
        sourceKey: adapter.sourceKey,
        providerKind: adapter.adapterKind ?? "unknown",
        label: adapter.label ?? adapter.sourceKey,
        updateChannel: "unknown",
        diagnostics: [{ severity: "error", code: "adapter-failed", message: "A source adapter failed without exposing raw local details." }],
        failed: true,
      });
    }
  });
  const sourceKeys = sourceResults.map((result) => result.sourceKey);
  invariant(new Set(sourceKeys).size === sourceKeys.length, "source adapter keys must be unique.");

  const sources = [];
  const items = [];
  const diagnostics = [];
  let excludedLocalOnly = 0;
  for (const result of [...sourceResults].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey, "en"))) {
    const sourceId = createSourceId(result.sourceKey);
    const sourceDiagnostics = [...result.diagnostics];
    const publicSourceUrl = safeHttpUrl(result.sourceUrl, "source", undefined, sourceDiagnostics);
    const grouped = new Map();
    for (const rawItem of result.items ?? []) {
      if (!rawItem?.name) continue;
      const records = grouped.get(rawItem.name) ?? [];
      records.push(rawItem);
      grouped.set(rawItem.name, records);
    }
    const publishedByName = new Map();
    const excludedNames = new Set();
    for (const [name, records] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
      if (records.length > 1) sourceDiagnostics.push({ severity: "error", code: "duplicate-skill", message: "Duplicate Skill names were found within one source; a deterministic record was selected.", itemName: name });
      const rawItem = canonicalChoice(records);
      const override = overrideByKey.get(`${result.sourceKey}\u0000${name}`);
      const origin = override?.origin ?? rawItem.origin ?? "unknown";
      const visibility = override?.visibility ?? rawItem.visibility ?? projectConfig.privacy.defaultVisibility;
      invariant(ORIGINS.has(origin), `Skill ${name} has an invalid origin override.`);
      invariant(VISIBILITIES.has(visibility), `Skill ${name} has an invalid visibility override.`);
      if (visibility === "local-only") {
        excludedLocalOnly += 1;
        excludedNames.add(name);
        continue;
      }
      if (visibility === "creator-showcase" && origin !== "creator") {
        sourceDiagnostics.push({ severity: "error", code: "creator-showcase-origin", message: "A creator-showcase record was excluded because creator authorship was not established.", itemName: name });
        continue;
      }
      const itemId = createSkillId(result.sourceKey, name);
      const item = compactRecord({
        id: itemId,
        kind: "skill",
        name,
        sourceId,
        state: STATES.has(rawItem.state) ? rawItem.state : "unknown",
        origin,
        visibility,
        status: rawItem.status,
        observed: isRecord(rawItem.observed) && Object.keys(rawItem.observed).length > 0 ? rawItem.observed : undefined,
      });
      items.push(item);
      publishedByName.set(name, item);
    }
    for (const entry of sourceDiagnostics) {
      if (entry.itemName && excludedNames.has(entry.itemName)) continue;
      const itemId = entry.itemName ? publishedByName.get(entry.itemName)?.id : undefined;
      diagnostics.push(diagnosticRecord({ sourceId, itemId, severity: entry.severity, code: entry.code, message: entry.message }));
    }
    const publicDiagnostics = diagnostics.filter((entry) => entry.sourceId === sourceId);
    const scanState = result.scanState === "failed" ? "failed" : publicDiagnostics.length > 0 ? "partial" : "complete";
    sources.push(compactRecord({
      id: sourceId,
      providerKind: result.providerKind,
      label: containsPrivateEvidence(result.label) ? "Skill Source" : normalizeWhitespace(result.label, 200),
      sourceUrl: publicSourceUrl,
      scanState,
      capabilities: {
        discovery: "read-only",
        write: false,
        updateChannel: UPDATE_CHANNELS.has(result.updateChannel) ? result.updateChannel : "unknown",
      },
    }));
  }

  const snapshot = createInventorySnapshotV1({
    projectId: projectConfig.projectId,
    generatedAt,
    sources,
    items,
    diagnostics,
  });
  return {
    snapshot,
    report: {
      scannedSources: sourceResults.length,
      observedItems: snapshot.items.length + excludedLocalOnly,
      inventoryItems: snapshot.items.length,
      publishedItems: snapshot.items.filter((item) => projectConfig.privacy.publicVisibilities.includes(item.visibility)).length,
      excludedLocalOnly,
      reviewRequired: snapshot.items.filter((item) => item.visibility === "review-required").length,
      warnings: snapshot.summary.warnings,
      errors: snapshot.summary.errors,
    },
  };
}
