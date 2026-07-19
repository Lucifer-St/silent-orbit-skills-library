import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicAssets } from "./validate-public-assets.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const controlFiles = new Set([
  "PUBLIC_RELEASE_MANIFEST.json",
  "PUBLIC_RELEASE_MANIFEST.md",
  "PHASE2_COMPLETION_RECEIPT.md",
]);
const generatedRoots = new Set([
  "node_modules",
  "dist",
  ".qa-output",
  ".qa-evidence",
  ".chrome-visual-qa-profile",
]);
const requiredFiles = [
  ".github/workflows/public-release-gate.yml",
  ".gitattributes",
  ".gitignore",
  ".node-version",
  "assets/readme/architecture.svg",
  "assets/readme/catalog.png",
  "assets/readme/hero.svg",
  "assets/readme/home.png",
  "assets/readme/inspector.png",
  "assets/readme/mobile-inspector.png",
  "assets/readme/social-preview.png",
  "ASSET_LICENSE.md",
  "ASSET_PROVENANCE.json",
  "CONTRIBUTING.md",
  "LICENSE",
  "PHASE2_COMPLETION_RECEIPT.md",
  "PRIVACY_AUDIT.md",
  "PUBLIC_RELEASE_MANIFEST.json",
  "PUBLIC_RELEASE_MANIFEST.md",
  "README.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "index.html",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
];
const textExtensions = new Set([
  "", ".css", ".html", ".js", ".json", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function walk(rootDir, relativeDir = "", { includeGenerated = false, repositoryAware = false } = {}) {
  const absoluteDir = path.join(rootDir, ...relativeDir.split("/").filter(Boolean));
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are forbidden: ${relativePath}`);
      if (entry.isDirectory()) {
        if (!relativeDir && repositoryAware && entry.name === ".git") return [];
        if (!includeGenerated && !relativeDir && generatedRoots.has(entry.name)) return [];
        return walk(rootDir, relativePath, { includeGenerated, repositoryAware });
      }
      if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${relativePath}`);
      return [relativePath];
    });
}

function manifestPayloadFiles(rootDir, { repositoryAware = false } = {}) {
  return walk(rootDir, "", { repositoryAware }).filter((relativePath) => !controlFiles.has(relativePath)).sort();
}

function manifestEntries(rootDir, { repositoryAware = false } = {}) {
  return manifestPayloadFiles(rootDir, { repositoryAware }).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(rootDir, ...relativePath.split("/")));
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
  });
}

function canonicalReleaseDigest(entries) {
  return sha256(`${entries.map((entry) => `${entry.sha256} ${entry.path}`).join("\n")}\n`);
}

function assertRequiredFiles(rootDir) {
  for (const relativePath of requiredFiles) {
    if (!fs.statSync(path.join(rootDir, ...relativePath.split("/")), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Required Public RC file is missing: ${relativePath}`);
    }
  }
  for (const directory of ["data", "public", "scripts", "src"]) {
    if (!fs.statSync(path.join(rootDir, directory), { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Required Public RC directory is missing: ${directory}`);
    }
  }
}

function assertForbiddenPaths(rootDir, { repositoryAware = false } = {}) {
  const forbiddenNames = [
    ".skills-library-maintenance",
    "private-skills.json",
    ["relationship", "canon.md"].join("-"),
  ];
  if (!repositoryAware && fs.existsSync(path.join(rootDir, ".git"))) throw new Error("Forbidden Public RC path: .git");
  for (const name of forbiddenNames) {
    if (fs.existsSync(path.join(rootDir, name))) throw new Error(`Forbidden Public RC path: ${name}`);
  }
  const allEntries = walk(rootDir, "", { includeGenerated: true, repositoryAware })
    .filter((relativePath) => !relativePath.startsWith("node_modules/"));
  for (const relativePath of allEntries) {
    const lowered = relativePath.toLowerCase();
    if (lowered === ".git" || lowered.startsWith(".git/") || lowered.includes("/.git/") || lowered.endsWith("/.git")) {
      throw new Error(`Forbidden nested Git metadata: ${relativePath}`);
    }
    if (forbiddenNames.some((name) => lowered === name || lowered.startsWith(`${name}/`) || lowered.includes(`/${name}/`) || lowered.endsWith(`/${name}`))) {
      throw new Error(`Forbidden Public RC path: ${relativePath}`);
    }
    if (lowered.endsWith(".map")) throw new Error(`Source maps are forbidden in the Public RC: ${relativePath}`);
    if (lowered.includes(["legacy", "external", "chat"].join("-"))) {
      throw new Error(`Forbidden legacy visual path: ${relativePath}`);
    }
  }
}

function assertManifest(rootDir, { repositoryAware = false } = {}) {
  const manifestPath = path.join(rootDir, "PUBLIC_RELEASE_MANIFEST.json");
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schemaVersion !== 1) throw new Error("Public release manifest schemaVersion must be 1.");
  if (!/^[0-9a-f]{40}$/.test(manifest.inputCommit ?? "")) throw new Error("Public release manifest inputCommit is invalid.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(manifest.inputCommitTimestamp ?? "")) {
    throw new Error("Public release manifest must use the stable input commit timestamp.");
  }

  const actualEntries = manifestEntries(rootDir, { repositoryAware });
  if (JSON.stringify(manifest.files) !== JSON.stringify(actualEntries)) {
    throw new Error("Public release manifest file inventory or hashes do not match the RC.");
  }
  const totalBytes = actualEntries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (manifest.fileCount !== actualEntries.length || manifest.totalBytes !== totalBytes) {
    throw new Error("Public release manifest totals do not match the RC.");
  }
  const releaseDigest = canonicalReleaseDigest(actualEntries);
  if (manifest.releaseDigestAlgorithm !== "sha256" || manifest.releaseDigest !== releaseDigest) {
    throw new Error("Public release canonical digest does not match the RC.");
  }
  if (JSON.stringify(manifest.excludedControlFiles) !== JSON.stringify([...controlFiles].sort())) {
    throw new Error("Public release manifest must explicitly record its self-reference exclusions.");
  }

  const receipt = fs.readFileSync(path.join(rootDir, "PHASE2_COMPLETION_RECEIPT.md"), "utf8");
  if (!receipt.includes(sha256(manifestBytes))) throw new Error("Completion receipt is missing the JSON manifest SHA-256.");
  if (!receipt.includes(manifest.releaseDigest)) throw new Error("Completion receipt is missing the canonical release digest.");
  const markdownManifest = fs.readFileSync(path.join(rootDir, "PUBLIC_RELEASE_MANIFEST.md"));
  if (!receipt.includes(sha256(markdownManifest))) throw new Error("Completion receipt is missing the Markdown manifest SHA-256.");
  return manifest;
}

function readJson(rootDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, ...relativePath.split("/")), "utf8"));
}

function assertNoForbiddenJsonKeys(value, location = "data") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenJsonKeys(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const forbiddenKeys = new Set([
    "frequency", "importance", "installed_path", "installedPath", "library_page", "skill_page",
    "task_count", "last_seen_at", "evidence_types", "transaction", "session_id", "sessionsRoot", "vaultRoot",
  ]);
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error(`Forbidden private/usage field ${location}.${key}.`);
    assertNoForbiddenJsonKeys(nested, `${location}.${key}`);
  }
}

function assertDataBoundary(rootDir) {
  const dataFiles = [
    "skills.json", "libraries.json", "category-units.json", "personal-skills.json", "changes.json",
    "starred-skills.json", "relations.json", "skill-details.json", "maintenance-status.json",
  ];
  for (const fileName of dataFiles) {
    const rootBytes = fs.readFileSync(path.join(rootDir, "data", fileName));
    const runtimeBytes = fs.readFileSync(path.join(rootDir, "public", "data", fileName));
    if (!rootBytes.equals(runtimeBytes)) throw new Error(`data/${fileName} and public/data/${fileName} differ.`);
    const value = JSON.parse(rootBytes.toString("utf8"));
    assertNoForbiddenJsonKeys(value, fileName);
    const serialized = JSON.stringify(value);
    if (serialized.includes('"visibility":"local-only"')) throw new Error(`${fileName} contains a local-only record.`);
    const privateContinuityTokens = [
      ["relationship", "canon"].join("-"),
      ["Guar", "dian"].join(""),
      ["private", "memory"].join("-"),
    ];
    if (privateContinuityTokens.some((token) => serialized.toLowerCase().includes(token.toLowerCase()))) {
      throw new Error(`${fileName} contains private continuity content.`);
    }
  }

  const skills = readJson(rootDir, "data/skills.json");
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const aihot = byName.get("aihot");
  if (aihot?.origin !== "third-party" || aihot?.visibility !== "public") {
    throw new Error("aihot must remain third-party/public.");
  }
  for (const name of ["fengxue", "fengxue-ai-weekly"]) {
    const skill = byName.get(name);
    if (skill?.origin !== "creator" || skill?.visibility !== "creator-showcase") {
      throw new Error(`${name} must remain creator/creator-showcase.`);
    }
  }
  for (const skill of skills) {
    if (skill.visibility !== "public" && skill.visibility !== "creator-showcase") {
      throw new Error(`${skill.name} has a forbidden public visibility.`);
    }
    if (typeof skill.trigger !== "string" || skill.trigger.length > 120) throw new Error(`${skill.name} has an invalid public invocation.`);
    if (typeof skill.description !== "string" || skill.description.length > 1200) throw new Error(`${skill.name} has an invalid public summary.`);
  }
}

function assertPackageContract(rootDir) {
  const packageJson = readJson(rootDir, "package.json");
  const expectedScripts = [
    "validate:data", "validate:assets", "validate:public-release", "validate:public-repository", "validate:readme",
    "test:mvp", "build", "smoke:ui", "qa:visual",
  ];
  for (const script of expectedScripts) {
    if (typeof packageJson.scripts?.[script] !== "string") throw new Error(`package.json is missing ${script}.`);
  }
  if (packageJson.scripts["validate:public-release"].includes(".public-release")) {
    throw new Error("Flat Public RC validation must target its own root.");
  }
  if (!packageJson.scripts["validate:public-repository"].includes("--repository-aware")) {
    throw new Error("Public repository validation must use the explicit repository-aware mode.");
  }
  if (packageJson.scripts["test:maintenance"].includes("../..")) {
    throw new Error("Public RC tests must not depend on the private repository layout.");
  }
}

function assertPrivacyAndSecrets(rootDir, { repositoryAware = false } = {}) {
  const allFiles = walk(rootDir, "", { includeGenerated: true, repositoryAware })
    .filter((relativePath) => !relativePath.startsWith("node_modules/"));
  const windowsHome = /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"'`]+/i;
  const unixHome = /\/(?:Users|home)\/[^/\s"'`]+/i;
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const assignedSecret = /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\s*[:=]\s*["'][A-Za-z0-9_./+=-]{12,}["']/i;
  const keyMarker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const tokenPrefixes = [["gh", "p_"].join(""), ["gh", "o_"].join(""), ["sk", "-proj-"].join("")];

  for (const relativePath of allFiles) {
    const extension = path.extname(relativePath).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    const absolutePath = path.join(rootDir, ...relativePath.split("/"));
    const text = fs.readFileSync(absolutePath, "utf8");
    if (windowsHome.test(text) || unixHome.test(text) || /file:\/\//i.test(text)) {
      throw new Error(`${relativePath} contains an absolute local path.`);
    }
    if (text.includes(keyMarker) || tokenPrefixes.some((prefix) => text.includes(prefix)) || assignedSecret.test(text)) {
      throw new Error(`${relativePath} contains secret-like material.`);
    }
    const emails = [...text.matchAll(email)].map((match) => match[0]);
    if (emails.length > 0 && !/(?:public|dist)\/fonts\/.+\/OFL\.txt$/.test(relativePath)) {
      throw new Error(`${relativePath} contains an email address outside a required font license.`);
    }
  }
}

function assertWorkflowContract(rootDir) {
  const workflow = fs.readFileSync(path.join(rootDir, ".github", "workflows", "public-release-gate.yml"), "utf8");
  if ((workflow.match(/^\s*runs-on:/gm) ?? []).length !== 1 || !/runs-on:\s*windows-latest/.test(workflow)) {
    throw new Error("Public release workflow must contain exactly one windows-latest job.");
  }
  if (/ubuntu-|pull_request_target|permissions:[\s\S]*?\bwrite\b|NETLIFY|upload-artifact/i.test(workflow)) {
    throw new Error("Public release workflow contains a disallowed runner, trigger, permission, deploy secret, or artifact upload.");
  }
  if (!/permissions:\s*[\r\n]+\s+contents:\s*read/.test(workflow)) {
    throw new Error("Public release workflow must use contents: read least privilege.");
  }
}

function assertGitAttributesContract(rootDir) {
  const attributes = fs.readFileSync(path.join(rootDir, ".gitattributes"), "utf8");
  const requiredRules = [
    "* text=auto eol=lf",
    "*.png binary",
    "*.ttf binary",
    "*.woff2 binary",
  ];
  for (const rule of requiredRules) {
    if (!attributes.split(/\r?\n/).includes(rule)) {
      throw new Error(`.gitattributes is missing the cross-platform rule: ${rule}`);
    }
  }
}

export function validatePublicRelease(rootDir = projectDir, { repositoryAware = false } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  if (!fs.statSync(resolvedRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Public RC root does not exist: ${resolvedRoot}`);
  }
  assertRequiredFiles(resolvedRoot);
  assertForbiddenPaths(resolvedRoot, { repositoryAware });
  const manifest = assertManifest(resolvedRoot, { repositoryAware });
  assertDataBoundary(resolvedRoot);
  assertPackageContract(resolvedRoot);
  assertGitAttributesContract(resolvedRoot);
  assertPrivacyAndSecrets(resolvedRoot, { repositoryAware });
  assertWorkflowContract(resolvedRoot);
  const assets = validatePublicAssets(resolvedRoot);
  const result = {
    inputCommit: manifest.inputCommit,
    files: manifest.fileCount,
    bytes: manifest.totalBytes,
    releaseDigest: manifest.releaseDigest,
    assets: assets.files,
  };
  console.log(`Public release validation passed. files=${result.files} bytes=${result.bytes} digest=${result.releaseDigest}`);
  return result;
}

function parseRoot(args) {
  const index = args.indexOf("--root");
  if (index === -1) return projectDir;
  if (!args[index + 1]) throw new Error("--root requires a directory.");
  return path.resolve(process.cwd(), args[index + 1]);
}

function parseRepositoryAware(args) {
  return args.includes("--repository-aware");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  validatePublicRelease(parseRoot(args), { repositoryAware: parseRepositoryAware(args) });
}
