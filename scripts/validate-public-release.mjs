import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicAssets } from "./validate-public-assets.mjs";
import { validateReadme } from "./validate-readme.mjs";
import { publicCodeownersText, publicPackageFiles, publicReleaseVersion } from "./public-release-config.mjs";
import {
  validateInventorySnapshotV1,
  validateLibrarySnapshotV1,
  validateProjectConfigV1,
  validateSiteManifestV1,
} from "./lib/generator-contracts.mjs";
import { assertLocalMarkdownLinks as assertMarkdownLinks } from "./lib/markdown-links.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const controlFiles = new Set([
  "PUBLIC_RELEASE_MANIFEST.json",
  "PUBLIC_RELEASE_MANIFEST.md",
  "PUBLIC_RELEASE_RECEIPT.md",
]);
const generatedRoots = new Set([
  "node_modules",
  "dist",
  ".qa-output",
  ".qa-evidence",
  ".chrome-visual-qa-profile",
]);
const requiredFiles = [
  ".github/CODEOWNERS",
  ".github/workflows/public-release-gate.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/experience_feedback.yml",
  ".github/ISSUE_TEMPLATE/v1_rc_acceptance.yml",
  ".github/ISSUE_TEMPLATE/customization_rc_acceptance.yml",
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
  "docs/testing/beta-feedback-template.md",
  "docs/testing/beta-testing.md",
  "CONTRIBUTING.md",
  "docs/guides/generator-quickstart.md",
  "docs/guides/generator-quickstart.zh-CN.md",
  "docs/guides/installation-and-upgrade.md",
  "docs/guides/installation-and-upgrade.zh-CN.md",
  "LICENSE",
  "PUBLIC_RELEASE_RECEIPT.md",
  "docs/policies/privacy.md",
  "docs/policies/privacy.zh-CN.md",
  "docs/audits/privacy-audit.md",
  "PUBLIC_RELEASE_MANIFEST.json",
  "PUBLIC_RELEASE_MANIFEST.md",
  "README.md",
  "README.zh-CN.md",
  "docs/guides/recovery.md",
  "docs/guides/recovery.zh-CN.md",
  "docs/releases/v0.11.0-beta.5.md",
  "docs/releases/v0.11.0-beta.6.md",
  "docs/releases/v0.11.0-beta.7.md",
  "docs/releases/v0.11.0-beta.8.md",
  "docs/releases/v0.11.0-beta.9.md",
  "docs/releases/v0.12.0-beta.1.md",
  "docs/releases/v0.13.0-beta.1.md",
  "docs/releases/v0.13.1-beta.1.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/policies/versioning-and-migrations.md",
  "docs/policies/versioning-and-migrations.zh-CN.md",
  "docs/testing/v1-rc-acceptance.md",
  "docs/testing/v1-rc-acceptance.zh-CN.md",
  "docs/testing/customization-rc-acceptance.zh-CN.md",
  "docs/testing/silent-orbit-novice-human-test-pack.zh-CN.template.md",
  "docs/testing/v1-rc-one-file-handoff.zh-CN.md",
  "docs/README.md",
  "index.html",
  "netlify.toml",
  "package-lock.json",
  "package.json",
  "schemas/schema-lock.v1.json",
  "schemas/schema-lock.v2.json",
  "schemas/schema-lock.v3.json",
  "schemas/novice-human-test-report.schema.json",
  "scripts/prepare-v1-release-assets.mjs",
  "scripts/validate-agent-skills.mjs",
  "tsconfig.json",
  "vite.config.ts",
  "public/robots.txt",
  "public/sitemap.xml",
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
      if (!relativeDir && repositoryAware && entry.name === ".git") return [];
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are forbidden: ${relativePath}`);
      if (entry.isDirectory()) {
        if (!relativeDir && entry.name === "node_modules") return [];
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
    if (
      lowered === ".silent-orbit-management"
      || lowered.startsWith(".silent-orbit-management/")
      || /(?:^|\/)(?:transactions|backups)(?:\/|$)/.test(lowered)
      || /(?:^|\/)(?:receipt|backup-manifest|management-plan|management-request)\.json$/.test(lowered)
    ) {
      throw new Error(`Forbidden management runtime artifact: ${relativePath}`);
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

  const receipt = fs.readFileSync(path.join(rootDir, "PUBLIC_RELEASE_RECEIPT.md"), "utf8");
  if (!receipt.includes(sha256(manifestBytes))) throw new Error("Completion receipt is missing the JSON manifest SHA-256.");
  if (!receipt.includes(manifest.releaseDigest)) throw new Error("Completion receipt is missing the canonical release digest.");
  const markdownManifest = fs.readFileSync(path.join(rootDir, "PUBLIC_RELEASE_MANIFEST.md"));
  if (!receipt.includes(sha256(markdownManifest))) throw new Error("Completion receipt is missing the Markdown manifest SHA-256.");
  return manifest;
}

export function assertFinalizedReleaseReceipt(rootDir, manifest = readJson(rootDir, "PUBLIC_RELEASE_MANIFEST.json")) {
  const receiptPath = path.join(rootDir, "PUBLIC_RELEASE_RECEIPT.md");
  const receipt = fs.readFileSync(receiptPath, "utf8");
  const manifestJsonHash = sha256(fs.readFileSync(path.join(rootDir, "PUBLIC_RELEASE_MANIFEST.json")));
  const manifestMarkdownHash = sha256(fs.readFileSync(path.join(rootDir, "PUBLIC_RELEASE_MANIFEST.md")));
  const goRows = receipt.match(/^- Public Release status: GO$/gm) ?? [];
  if (goRows.length !== 1) {
    throw new Error("Public release requires exactly one finalized GO receipt status.");
  }
  for (const expected of [
    "# Public Release completion receipt",
    `- Input commit: \`${manifest.inputCommit}\``,
    `- Input commit timestamp: \`${manifest.inputCommitTimestamp}\``,
    `- Canonical release digest: \`${manifest.releaseDigest}\``,
    `- JSON manifest SHA-256: \`${manifestJsonHash}\``,
    `- Markdown manifest SHA-256: \`${manifestMarkdownHash}\``,
    `- Payload: ${manifest.fileCount} files / ${manifest.totalBytes} bytes`,
    "## Fresh-RC verification",
    "- `npm ci`: PASS, pinned dependency install",
    "- `npm run validate:data`: PASS",
    "- `npm run validate:assets`: PASS",
    "- `npm run validate:skills`: PASS",
    "- `npm run validate:public-release`: PASS before and after build/QA",
    "- `npm run test:mvp`: PASS",
    "- `npx tsc --noEmit`: PASS",
    "- `npm run build`: PASS",
    "- `npm run smoke:ui`: PASS, zero browser console/runtime errors",
    "- `npm run qa:visual`: PASS, 22/22 desktop/mobile states",
    "## Release boundary",
    "- Export boundary: allowlisted current snapshot only; no Private Git history",
    "- Repository visibility, default branch, branch protection, PR, merge, and tag actions: none",
    "- Netlify site, configuration, and deploy actions: none",
    "- Private maintenance, Obsidian, and usage-write actions: none",
    "This deterministic receipt is written only after every fresh-RC gate exits successfully.",
  ]) {
    if (!receipt.includes(expected)) throw new Error(`Finalized Public release receipt is missing ${expected}.`);
  }
  if (!/^- Production bundles: (?=.*`index-[^`]+\.css`)(?=.*`index-[^`]+\.js`).+$/m.test(receipt)) {
    throw new Error("Finalized Public release receipt is missing production CSS/JS bundle evidence.");
  }
  if (/candidate receipt|remains a handoff candidate/i.test(receipt)) {
    throw new Error("Candidate receipt cannot be published as a finalized Public release asset.");
  }
  return receipt;
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
    "allowedRoots", "runtimeRoot", "transactionRoot", "transactionId", "backupManifest", "backupKey", "receiptId", "planId",
  ]);
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error(`Forbidden private/usage field ${location}.${key}.`);
    assertNoForbiddenJsonKeys(nested, `${location}.${key}`);
  }
}

export function assertNoPrivateOperationalEvidence(changes) {
  const serialized = JSON.stringify(changes);
  const forbiddenPatterns = [
    /\b(?:manifest|ledger|receipt)[-_a-z0-9.]*\.json\b/i,
    /\bglobal\/user skill index\b/i,
    /\bon disk but outside the active\b/i,
    /\b(?:stale\s+)?[a-z0-9_.-]+\s+lock\s+(?:record|file)\b/i,
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("changes.json contains private operational evidence.");
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
    if (fileName === "changes.json") assertNoPrivateOperationalEvidence(value);
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

  const projectConfig = validateProjectConfigV1(readJson(rootDir, "data/project-config.json"));
  const inventorySnapshot = validateInventorySnapshotV1(readJson(rootDir, "data/inventory.snapshot.json"));
  const librarySnapshot = validateLibrarySnapshotV1(readJson(rootDir, "data/library.snapshot.json"));
  const libraries = readJson(rootDir, "data/libraries.json");
  const categoryUnits = readJson(rootDir, "data/category-units.json");
  validateSiteManifestV1(readJson(rootDir, "data/site-manifest.json"), { projectConfig, inventorySnapshot, librarySnapshot });
  for (const [fileName, value] of [
    ["inventory.snapshot.json", inventorySnapshot],
    ["library.snapshot.json", librarySnapshot],
  ]) {
    assertNoForbiddenJsonKeys(value, fileName);
  }
  if (
    librarySnapshot.skills.length !== skills.length
    || librarySnapshot.libraries.length !== libraries.length
    || librarySnapshot.categories.length !== categoryUnits.length
  ) {
    throw new Error("Generated Public contract projection lost current catalog parity.");
  }
}

function assertPackageContract(rootDir) {
  const packageJson = readJson(rootDir, "package.json");
  const expectedScripts = [
    "validate:data", "validate:assets", "validate:skills", "validate:public-release", "validate:public-repository", "validate:readme",
    "test:management", "test:mvp", "build", "smoke:ui", "qa:visual",
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
  if (packageJson.version !== publicReleaseVersion) {
    throw new Error(`Public package version must be ${publicReleaseVersion}.`);
  }
  if (JSON.stringify(packageJson.files) !== JSON.stringify(publicPackageFiles)) {
    throw new Error("Public package file allowlist does not match the governed release surface.");
  }
}

function assertHandoffContract(rootDir) {
  const handoffPath = path.join(rootDir, "docs", "testing", "v1-rc-one-file-handoff.zh-CN.md");
  const bytes = fs.readFileSync(handoffPath);
  if (bytes.subarray(0, 3).toString("hex") !== "efbbbf") {
    throw new Error("Public one-file handoff must be UTF-8 with BOM.");
  }
  const content = bytes.toString("utf8").replace(/^\uFEFF/, "");
  for (const expected of [
    `v${publicReleaseVersion}`,
    `https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v${publicReleaseVersion}`,
    "旧版 v1 RC 单文件交接说明",
    "SILENT_ORBIT_NOVICE_REPORT_JSON",
  ]) {
    if (!content.includes(expected)) throw new Error(`Public one-file handoff is missing ${expected}.`);
  }
  if (content.includes("{{")) {
    throw new Error("Public one-file handoff contains an unresolved template token.");
  }
  if (content.includes("\r")) throw new Error("Public one-file handoff must use LF line endings.");
}

export function assertNovicePackTemplate(rootDir) {
  const content = fs.readFileSync(path.join(rootDir, "docs", "testing", "silent-orbit-novice-human-test-pack.zh-CN.template.md"), "utf8");
  for (const expected of ["一次只问一个", "portable/project-local Node 24", "不得默认全局安装", "Customization Issue Form 等价回执", "SILENT_ORBIT_NOVICE_REPORT_JSON"]) {
    if (!content.includes(expected)) throw new Error(`Novice human test pack template is missing ${expected}.`);
  }
  for (const token of ["{{PUBLIC_TARBALL_SHA256}}", "{{PUBLIC_TARBALL_URL}}"] ) {
    if (!content.includes(token)) throw new Error(`Novice human test pack template is missing build token ${token}.`);
  }
  for (const expected of [`v${publicReleaseVersion}`, `silent-orbit-skills-library-${publicReleaseVersion}.tgz`, `https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v${publicReleaseVersion}`]) {
    if (!content.includes(expected)) throw new Error(`Novice human test pack template is missing release binding ${expected}.`);
  }
  const releaseBindingLines = content.match(/^- Release：`[^`]+`$/gm) ?? [];
  if (JSON.stringify(releaseBindingLines) !== JSON.stringify([`- Release：\`v${publicReleaseVersion}\``])) {
    throw new Error("Novice human test pack template must contain exactly one fixed binding line.");
  }
  const unresolved = content.match(/{{[^{}\r\n]+}}/g) ?? [];
  if (JSON.stringify([...new Set(unresolved)].sort()) !== JSON.stringify(["{{PUBLIC_TARBALL_SHA256}}", "{{PUBLIC_TARBALL_URL}}"].sort())) {
    throw new Error("Novice human test pack template contains an unexpected build token.");
  }
}

export function assertLocalMarkdownLinks(rootDir) {
  const markdownFiles = walk(rootDir, "", { includeGenerated: false, repositoryAware: true })
    .filter((relativePath) => relativePath.endsWith(".md"))
    .map((relativePath) => path.join(rootDir, ...relativePath.split("/")));
  assertMarkdownLinks({
    rootDir,
    filePaths: markdownFiles,
    context: "Public release",
  });
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
    const pathScanText = text.replaceAll("/tmp/home", "<container-home>");
    if (windowsHome.test(pathScanText) || unixHome.test(pathScanText) || /file:\/\//i.test(pathScanText)) {
      throw new Error(`${relativePath} contains an absolute local path.`);
    }
    if (text.includes(keyMarker) || tokenPrefixes.some((prefix) => text.includes(prefix)) || assignedSecret.test(text)) {
      throw new Error(`${relativePath} contains secret-like material.`);
    }
    const emails = [...text.matchAll(email)].map((match) => match[0]);
    if (emails.length > 0 && !/\/fonts\/.+\/OFL\.txt$/.test(`/${relativePath}`)) {
      throw new Error(`${relativePath} contains an email address outside a required font license.`);
    }
  }
}

function assertWorkflowContract(rootDir) {
  const workflow = fs.readFileSync(path.join(rootDir, ".github", "workflows", "public-release-gate.yml"), "utf8");
  for (const required of [
    "node-version: 24",
    "npm run preflight:v1 -- --mode public-core",
    "npm run preflight:v1 -- --mode package-smoke",
    "npm run preflight:v1 -- --mode docker",
    "os: [windows-latest, ubuntu-latest, macos-latest]",
    "needs: [v1-core, package-smoke, docker-smoke]",
    "name: release-gate",
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    "persist-credentials: false",
  ]) {
    if (!workflow.includes(required)) throw new Error(`Public release workflow is missing ${required}.`);
  }
  if (/pull_request_target|workflow_dispatch|paths-ignore\s*:|^\s+paths\s*:|permissions:[\s\S]*?\bwrite\b|NETLIFY|upload-artifact|netlify\s+deploy/im.test(workflow)) {
    throw new Error("Public release workflow contains a disallowed trigger, path filter, permission, deploy secret, artifact upload, or direct deploy.");
  }
  if (!/permissions:\s*[\r\n]+\s+contents:\s*read/.test(workflow)) {
    throw new Error("Public release workflow must use contents: read least privilege.");
  }
  if (/uses:\s+\S+@(?:v\d+|main|master)\b/.test(workflow)) {
    throw new Error("Public release workflow must pin every Action to a full commit SHA.");
  }
  const allowedActions = new Set([
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  ]);
  for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    if (!allowedActions.has(match[1])) {
      throw new Error(`Public release workflow uses an unreviewed Action: ${match[1]}`);
    }
  }
}

export function assertCodeownersContract(rootDir) {
  const codeowners = fs.readFileSync(path.join(rootDir, ".github", "CODEOWNERS"), "utf8");
  if (codeowners !== publicCodeownersText) {
    throw new Error("Public CODEOWNERS must exactly match the canonical owner-only policy.");
  }
}

function assertGitAttributesContract(rootDir) {
  const attributes = fs.readFileSync(path.join(rootDir, ".gitattributes"), "utf8");
  const requiredRules = [
    "* text=auto eol=lf",
    "*.sh text eol=lf",
    "assets/readme/** binary",
    "public/assets/** binary",
    "public/fonts/** binary",
    "templates/reference-index-v1/fonts/** binary",
  ];
  for (const rule of requiredRules) {
    if (!attributes.split(/\r?\n/).includes(rule)) {
      throw new Error(`.gitattributes is missing the cross-platform rule: ${rule}`);
    }
  }
}

export function validatePublicRelease(rootDir = projectDir, { repositoryAware = false, quiet = false } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  if (!fs.statSync(resolvedRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Public RC root does not exist: ${resolvedRoot}`);
  }
  assertRequiredFiles(resolvedRoot);
  assertForbiddenPaths(resolvedRoot, { repositoryAware });
  const manifest = assertManifest(resolvedRoot, { repositoryAware });
  if (repositoryAware) assertFinalizedReleaseReceipt(resolvedRoot, manifest);
  assertDataBoundary(resolvedRoot);
  assertPackageContract(resolvedRoot);
  assertHandoffContract(resolvedRoot);
  assertNovicePackTemplate(resolvedRoot);
  assertLocalMarkdownLinks(resolvedRoot);
  assertGitAttributesContract(resolvedRoot);
  assertCodeownersContract(resolvedRoot);
  assertPrivacyAndSecrets(resolvedRoot, { repositoryAware });
  assertWorkflowContract(resolvedRoot);
  const assets = validatePublicAssets(resolvedRoot, { quiet });
  const readme = validateReadme(resolvedRoot, { quiet });
  const result = {
    inputCommit: manifest.inputCommit,
    files: manifest.fileCount,
    bytes: manifest.totalBytes,
    releaseDigest: manifest.releaseDigest,
    assets: assets.files,
    readmes: readme.readmes,
  };
  if (!quiet) console.log(`Public release validation passed. files=${result.files} bytes=${result.bytes} digest=${result.releaseDigest}`);
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
