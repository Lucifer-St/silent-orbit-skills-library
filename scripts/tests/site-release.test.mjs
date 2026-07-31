import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const canonicalUrl = "https://silent-orbit-skills-library.netlify.app/";

function read(relativePath) {
  return fs.readFileSync(path.join(projectDir, ...relativePath.split("/")), "utf8");
}

const publicDocumentPaths = Object.freeze({
  "BETA_TESTING.md": "docs/testing/beta-testing.md",
  "BETA_FEEDBACK_TEMPLATE.md": "docs/testing/beta-feedback-template.md",
  "GENERATOR_QUICKSTART.md": "docs/guides/generator-quickstart.md",
  "GENERATOR_QUICKSTART.zh-CN.md": "docs/guides/generator-quickstart.zh-CN.md",
  "RELEASE_NOTES_v0.11.0-beta.9.md": "docs/releases/v0.11.0-beta.9.md",
  "RELEASE_NOTES_v0.12.0-beta.1.md": "docs/releases/v0.12.0-beta.1.md",
  "V1_RC_ACCEPTANCE.md": "docs/testing/v1-rc-acceptance.md",
  "V1_RC_ACCEPTANCE.zh-CN.md": "docs/testing/v1-rc-acceptance.zh-CN.md",
  "V1_RC_ONE_FILE_HANDOFF.zh-CN.md": "docs/testing/v1-rc-one-file-handoff.zh-CN.md",
  "CUSTOMIZATION_RC_ACCEPTANCE.zh-CN.md": "docs/testing/customization-rc-acceptance.zh-CN.md",
  "INSTALLATION_AND_UPGRADE.md": "docs/guides/installation-and-upgrade.md",
  "VERSIONING_AND_MIGRATIONS.md": "docs/policies/versioning-and-migrations.md",
  "PRIVACY.md": "docs/policies/privacy.md",
  "RECOVERY.md": "docs/guides/recovery.md",
});

function publicDocument(fileName) {
  const sourcePath = `docs/public-release/${fileName}`;
  if (fs.existsSync(path.join(projectDir, ...sourcePath.split("/")))) return sourcePath;
  return publicDocumentPaths[fileName] ?? fileName;
}

function issueTemplate(fileName) {
  const sourcePath = `docs/public-release/github/ISSUE_TEMPLATE/${fileName}`;
  return fs.existsSync(path.join(projectDir, ...sourcePath.split("/")))
    ? sourcePath
    : `.github/ISSUE_TEMPLATE/${fileName}`;
}

function publicWorkflow(fileName) {
  const sourcePath = `docs/public-release/github/${fileName}`;
  return fs.existsSync(path.join(projectDir, ...sourcePath.split("/")))
    ? sourcePath
    : `.github/workflows/${fileName}`;
}

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertExactTarballChecksumInstructions(content, label, packageVersion) {
  const tarball = `silent-orbit-skills-library-${packageVersion}.tgz`;
  const escapedTarball = `${escapeRegexLiteral(tarball)}$`;
  const escapedTarballs = content.match(
    /silent-orbit-skills-library-\d+\\\.\d+\\\.\d+-beta\\\.\d+\\\.tgz\$/g,
  ) ?? [];

  assert.deepEqual(
    escapedTarballs,
    [escapedTarball],
    `${label} must contain exactly one escaped checksum pattern for the current tarball.`,
  );
  assert.match(content, /\$matches\.Count -ne 1/);
  assert.match(content, /sha256sum --check -/);
  assert.match(content, /shasum -a 256/);
  assert.doesNotMatch(
    content,
    /Get-Content[^\r\n]*SHA256SUMS\.txt[^\r\n]*-split\s+['"]\\s\+['"][^\r\n]*\[0\]/i,
    `${label} must not treat the first hash in SHA256SUMS.txt as the tarball hash.`,
  );
  assert.doesNotMatch(
    content,
    /\b(?:sha256sum\s+(?:-c|--check)|shasum\s+-a\s+256\s+(?:-c|--check))\s+(?:\.\/)?SHA256SUMS\.txt\b/i,
    `${label} must not verify all checksum rows when only a subset of assets is downloaded.`,
  );
}

function readPng(relativePath) {
  const bytes = fs.readFileSync(path.join(projectDir, ...relativePath.split("/")));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${relativePath} must be PNG.`);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    chunks.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return { bytes, chunks, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("production metadata uses the exact public canonical and social assets", () => {
  const html = read("index.html");
  for (const required of [
    '<html lang="zh-CN">',
    '<title>Silent Orbit Skills Library</title>',
    `<link rel="canonical" href="${canonicalUrl}" />`,
    'name="description"',
    'name="theme-color"',
    'property="og:title"',
    'property="og:description"',
    `property="og:url" content="${canonicalUrl}"`,
    'property="og:image" content="https://silent-orbit-skills-library.netlify.app/social-preview.png"',
    'name="twitter:card" content="summary_large_image"',
    'name="twitter:image" content="https://silent-orbit-skills-library.netlify.app/social-preview.png"',
    'href="/assets/branding/favicon.svg"',
  ]) {
    assert.ok(html.includes(required), `index.html is missing ${required}`);
  }
  assert.doesNotMatch(html, /data:,|localhost|example\.com/i);
});

test("full UI smoke drives localized controls through stable hooks", () => {
  const smoke = read("scripts/smoke-ui.mjs");
  const visualQa = read("scripts/capture-visual-qa.mjs");
  const lines = smoke.split(/\r?\n/);
  const visualQaLines = visualQa.split(/\r?\n/);

  assert.equal(
    lines.filter((line) => line.includes("nav-button") && line.includes("textContent.trim")).length,
    0,
    "Navigation smoke must not depend on translated button text.",
  );
  assert.equal(
    lines.filter((line) => line.includes("inspector-return-button") && line.includes("textContent")).length,
    0,
    "Inspector return smoke must not depend on translated button text.",
  );
  assert.equal(
    lines.filter((line) => line.includes("textContent.trim() === 'RECORD OUTCOME'")).length,
    0,
    "Outcome smoke must use the stable outcome-record-button hook.",
  );
  assert.doesNotMatch(smoke, /aria-label=\\?"Zoom in\\?"/);
  assert.match(smoke, /data-nav-label=\\?"CATALOG\\?"/);
  assert.match(smoke, /data-catalog-target=\\?"maintenance\\?"/);
  assert.match(smoke, /outcome-record-button/);
  assert.equal(
    visualQaLines.filter((line) => line.includes("nav-button") && line.includes("textContent.trim")).length,
    0,
    "Visual QA navigation must not depend on translated button text.",
  );
  assert.match(visualQa, /data-nav-label=\\?"CATALOG\\?"/);
  assert.match(visualQa, /data-nav-label=\\?"HISTORY\\?"/);
});

test("mobile first-use and Catalog metadata keep touch and CJK reading contracts", () => {
  const librarianCss = read("src/styles/librarian.css");
  const consoleCss = read("src/styles/console.css");

  assert.match(
    librarianCss,
    /\.librarian-onboarding button\s*\{[^}]*min-height:\s*44px;/,
  );
  assert.match(
    consoleCss,
    /\.catalog-category-copy small\s*\{\s*letter-spacing:\s*normal;/,
  );
});

test("public and generated interfaces are Chinese-first with a reversible language switch", () => {
  const templateHtml = read("templates/reference-index-v1/index.html");
  const templateApp = read("templates/reference-index-v1/app.js");
  const projectRuntime = read("scripts/lib/silent-orbit-project.mjs");

  assert.match(templateHtml, /<html lang="zh-CN">/);
  assert.match(templateHtml, /id="locale-toggle"/);
  assert.match(templateHtml, /data-i18n="map">地图</);
  assert.match(templateHtml, /data-i18n-placeholder="searchPlaceholder"/);
  assert.match(templateApp, /silent-orbit-reference-locale-v1/);
  assert.match(templateApp, /description_i18n/);
  assert.match(templateApp, /localStorage\.setItem\(LOCALE_STORAGE_KEY/);
  assert.match(templateApp, /defaultLocale/);
  assert.match(projectRuntime, /locales:\s*\["zh-CN",\s*"en-US"\]/);
  assert.match(projectRuntime, /defaultLocale:\s*"zh-CN"/);
});

test("robots, sitemap, favicon, and social preview are public-safe", () => {
  assert.match(read("public/robots.txt"), /Allow:\s*\//);
  assert.match(read("public/robots.txt"), new RegExp(`${canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}sitemap\\.xml`, "i"));
  const sitemap = read("public/sitemap.xml");
  assert.match(sitemap, /<urlset\b/);
  assert.ok(sitemap.includes(`<loc>${canonicalUrl}</loc>`));

  const favicon = read("public/assets/branding/favicon.svg");
  assert.match(favicon, /<svg\b/);
  assert.match(favicon, /<title\b/);
  assert.match(favicon, /<desc\b/);
  assert.doesNotMatch(favicon, /<script\b|<foreignObject\b|@import|(?:href|xlink:href|src)=["']https?:\/\//i);

  const socialPath = fs.existsSync(path.join(projectDir, "assets", "readme", "social-preview.png"))
    ? "assets/readme/social-preview.png"
    : "docs/public-release/assets/social-preview.png";
  const social = readPng(socialPath);
  assert.equal(social.width, 1280);
  assert.equal(social.height, 640);
  for (const chunk of ["tEXt", "zTXt", "iTXt", "eXIf"]) assert.equal(social.chunks.includes(chunk), false);
});

test("tracked Netlify configuration defines one safe and consistent build", () => {
  const config = read("netlify.toml");
  assert.match(config, /NODE_VERSION\s*=\s*"24"/);
  assert.match(config, /command\s*=\s*"npm run build"/);
  assert.match(config, /publish\s*=\s*"dist"/);
  assert.match(config, /\[context\.production\]/);
  assert.match(config, /\[context\.deploy-preview\]/);
  assert.match(config, /from\s*=\s*"\/\*"[\s\S]*to\s*=\s*"\/index\.html"[\s\S]*status\s*=\s*200/);
  for (const header of ["X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options", "Content-Security-Policy"]) {
    assert.ok(config.includes(header), `netlify.toml is missing ${header}`);
  }
  assert.match(config, /max-age=0, must-revalidate/);
  assert.match(config, /max-age=31536000, immutable/);
  assert.doesNotMatch(config, /unsafe-eval|NETLIFY_AUTH_TOKEN|deploy\s+--prod/i);
});

test("required public gates execute Agent Skill, release-asset, and native checksum contracts", () => {
  const workflow = read(publicWorkflow("public-release-gate.yml"));
  const preflight = read("scripts/run-v1-preflight.mjs");

  assert.match(workflow, /npm run preflight:v1 -- --mode public-core/);
  assert.match(workflow, /matrix:[\s\S]*windows-latest[\s\S]*ubuntu-latest[\s\S]*macos-latest/);
  assert.match(workflow, /npm run preflight:v1 -- --mode package-smoke/);
  assert.match(preflight, /\["public-mvp", \["run", "test:mvp"\]\]/);
  assert.match(preflight, /\["agent-skill-contract", \["run", "test:agent-skill"\]\]/);
  assert.match(preflight, /if \(publicRepository\) runReleaseAssetsContract\(\)/);
  assert.match(preflight, /checksumRows\.some\(\(row\) => row === null\)/);
  assert.match(preflight, /documented-checksum-windows/);
  assert.match(preflight, /documented-checksum-linux/);
  assert.match(preflight, /documented-checksum-macos/);
  assert.match(preflight, /\["pwsh\.exe", "powershell\.exe"\]/);
  assert.match(preflight, /Get-Command Get-FileHash -ErrorAction SilentlyContinue/);
  assert.match(preflight, /run\(resolveChecksumPowerShell\(\),/);
  assert.match(
    preflight,
    /withPreparedReleaseAssets\(\(\{ outputDir, tarball, tarballName, handoff \}\) => \{[\s\S]*runDocumentedChecksumSmoke\(outputDir, tarballName\);[\s\S]*runPackageSmoke\(\{ tarball, handoff \}\);/,
  );
});

test("release checksum instructions select one exact current tarball on each operating system", () => {
  const packageVersion = JSON.parse(read("package.json")).version;
  for (const fileName of [
    "GENERATOR_QUICKSTART.md",
    "GENERATOR_QUICKSTART.zh-CN.md",
    "V1_RC_ACCEPTANCE.md",
    "V1_RC_ACCEPTANCE.zh-CN.md",
  ]) {
    const relativePath = publicDocument(fileName);
    assertExactTarballChecksumInstructions(read(relativePath), relativePath, packageVersion);
  }
});

test("public beta materials cover tasks, severity, privacy, and both issue forms", () => {
  const testing = read(publicDocument("BETA_TESTING.md"));
  for (let task = 1; task <= 7; task += 1) assert.match(testing, new RegExp(`^${task}\\.`, "m"));
  for (const severity of ["P0", "P1", "P2", "Idea"]) assert.ok(testing.includes(severity));
  assert.match(testing, /no third-party analytics, cookies, or behavior tracking/i);
  assert.match(testing, /Safari is an external beta check/i);

  const feedback = read(publicDocument("BETA_FEEDBACK_TEMPLATE.md"));
  for (const prompt of ["Most confusing", "Liked most", "Most wanted to click"]) assert.ok(feedback.includes(prompt));
  for (const template of ["bug_report.yml", "experience_feedback.yml", "v1_rc_acceptance.yml", "customization_rc_acceptance.yml"]) {
    const body = read(issueTemplate(template));
    assert.match(body, /^name:/m);
    assert.match(body, /public-beta/);
    assert.doesNotMatch(body, /email|account id/i);
  }
  const v1Acceptance = read(publicDocument("V1_RC_ACCEPTANCE.md"));
  assert.match(v1Acceptance, /15[–-]25 minutes/);
  assert.match(v1Acceptance, /independent user/i);
  assert.match(v1Acceptance, /SHA256SUMS\.txt/);
  assert.match(v1Acceptance, /second scan\/diff/i);
  assert.match(v1Acceptance, /npx skills@1\.5\.20 check/);
  assert.match(v1Acceptance, /private copy[\s\S]*only for privacy triage[\s\S]*not Phase 6B evidence/i);
  assert.match(v1Acceptance, /independent user[\s\S]*personally submit the Issue[\s\S]*Form/i);

  const v1AcceptanceZh = read(publicDocument("V1_RC_ACCEPTANCE.zh-CN.md"));
  assert.match(v1AcceptanceZh, /中文傻瓜验收/);
  assert.match(v1AcceptanceZh, /Codex \/ Claude Code \/ Kimi Code/);
  assert.match(v1AcceptanceZh, /SHA256SUMS\.txt/);
  assert.match(v1AcceptanceZh, /added: 0[\s\S]*changed: 0[\s\S]*removed: 0/);
  assert.match(v1AcceptanceZh, /同意执行这一批可信来源维护/);
  assert.match(v1AcceptanceZh, /privacy-safe receipt/);
  assert.match(v1AcceptanceZh, /私下[\s\S]*只用于 privacy triage[\s\S]*不算 Phase 6B 验收证据/);
  assert.match(v1AcceptanceZh, /独立用户本人提交 Issue Form/);
  assert.doesNotMatch(v1AcceptanceZh, /短报告原样发回/);

  const oneFileHandoffZh = read(publicDocument("V1_RC_ONE_FILE_HANDOFF.zh-CN.md"));
  assert.match(oneFileHandoffZh, /单文件真人验收交接包/);
  assert.match(oneFileHandoffZh, /你不需要输入命令/);
  assert.match(oneFileHandoffZh, /开始验收/);
  assert.match(oneFileHandoffZh, /V1_RC_ONE_FILE_HANDOFF\.zh-CN\.md/);
  assert.match(oneFileHandoffZh, /UTF-8/);
  assert.match(oneFileHandoffZh, /我同意执行这一批可信来源维护/);
  assert.match(oneFileHandoffZh, /SILENT_ORBIT_RETURN_REPORT_V1/);
  assert.match(oneFileHandoffZh, /handoffContract: \[PASS\/FAIL\/NOT_RUN\]/);
  assert.match(oneFileHandoffZh, /不得附加原始日志/);
  assert.match(
    oneFileHandoffZh,
    /Windows PowerShell 单行：[\s\S]*create-v1-acceptance-summary\.mjs --project \.\\my-skill-cosmos[\s\S]*--out \.\\silent-orbit-v1-acceptance-receipt\.json/,
  );
  assert.match(oneFileHandoffZh, /私下回传[\s\S]*只用于 privacy triage[\s\S]*不构成 Phase 6B 验收证据/);
  assert.match(oneFileHandoffZh, /独立用户本人提交 GitHub Issue Form/);

  const beta9ReleaseNotes = read(publicDocument("RELEASE_NOTES_v0.11.0-beta.9.md"));
  assert.match(beta9ReleaseNotes, /releases\/download\/(?:\{\{PUBLIC_RELEASE_TAG\}\}|v0\.11\.0-beta\.9)\/V1_RC_ONE_FILE_HANDOFF\.zh-CN\.md/);
  assert.match(beta9ReleaseNotes, /docs\/testing\/v1-rc-acceptance\.zh-CN\.md/);
  assert.match(beta9ReleaseNotes, /issues\/new\?template=v1_rc_acceptance\.yml/);
  assert.match(beta9ReleaseNotes, /private copy[\s\S]*privacy triage[\s\S]*not completed Phase 6B evidence/i);

  const customizationReleaseNotes = read(publicDocument("RELEASE_NOTES_v0.12.0-beta.1.md"));
  assert.match(customizationReleaseNotes, /CLI interface `0\.5\.0`/);
  assert.match(customizationReleaseNotes, /exactly two functional directions/i);
  assert.match(customizationReleaseNotes, /keep`, `adjust`, `reject`, and `redo`/);
  assert.match(customizationReleaseNotes, /Independent-user acceptance has not started/i);

  const customizationAcceptance = read(publicDocument("CUSTOMIZATION_RC_ACCEPTANCE.zh-CN.md"));
  assert.match(customizationAcceptance, /当前未启动/);
  assert.match(customizationAcceptance, /恰好两套/);
  assert.match(customizationAcceptance, /调整 \/ adjust/);
  assert.match(customizationAcceptance, /stylePreserved: true/);
  assert.match(customizationAcceptance, /独立用户本人/);
});

test("beta version, root-safe Vite base, and publication handoff are explicit", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.version, "0.12.0-beta.1");
  const vite = read("vite.config.ts");
  assert.match(vite, /base:\s*"\/"/);
  assert.match(vite, /copy-social-preview/);

  const status = JSON.parse(read("public/data/maintenance-status.json"));
  assert.deepEqual(status.publicationHandoff, {
    productionAuthority: "public-github-main",
    publicRepository: "Lucifer-St/silent-orbit-skills-library",
    requiredCheck: "release-gate",
    deployProvider: "netlify",
    directPrivateProductionDeploy: false,
  });
});

test("v1 schemas are frozen by the Phase 6A release lock", () => {
  const lock = JSON.parse(read("schemas/schema-lock.v1.json"));
  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.releaseVersion, "0.11.0-beta.9");
  assert.equal(lock.cliInterfaceVersion, "0.4.0");
  assert.equal(lock.compatibilityFamily, "v1");
  assert.equal(lock.hashAlgorithm, "sha256");
  assert.equal(lock.lineEnding, "LF");

  const schemaDir = path.join(projectDir, "schemas");
  const actualNames = fs.readdirSync(schemaDir)
    .filter((name) => name.endsWith(".v1.schema.json"))
    .sort();
  assert.deepEqual(lock.schemas.map((entry) => entry.path), actualNames);
  for (const entry of lock.schemas) {
    assert.match(entry.path, /\.v1\.schema\.json$/);
    const canonicalSchema = fs.readFileSync(path.join(schemaDir, entry.path), "utf8")
      .replace(/\r\n?/g, "\n");
    const digest = createHash("sha256")
      .update(canonicalSchema)
      .digest("hex");
    assert.equal(entry.sha256, digest, `${entry.path} changed after the v1 lock.`);
  }
});

test("customization v2 sidecars are frozen by their independent release lock", () => {
  const lock = JSON.parse(read("schemas/schema-lock.v2.json"));
  assert.equal(lock.schemaVersion, 2);
  assert.equal(lock.releaseVersion, "0.12.0-beta.1");
  assert.equal(lock.cliInterfaceVersion, "0.5.0");
  assert.equal(lock.compatibilityFamily, "customization-v2-sidecar");
  assert.equal(lock.hashAlgorithm, "sha256");
  assert.equal(lock.lineEnding, "LF");

  const schemaDir = path.join(projectDir, "schemas");
  const actualNames = fs.readdirSync(schemaDir)
    .filter((name) => name.endsWith(".v2.schema.json"))
    .sort();
  assert.deepEqual(lock.schemas.map((entry) => entry.path), actualNames);
  for (const entry of lock.schemas) {
    const canonicalSchema = fs.readFileSync(path.join(schemaDir, entry.path), "utf8")
      .replace(/\r\n?/g, "\n");
    const digest = createHash("sha256")
      .update(canonicalSchema)
      .digest("hex");
    assert.equal(entry.sha256, digest, `${entry.path} changed after the v2 lock.`);
  }
});

test("Phase 6A operational handoff documents every required boundary", () => {
  const requirements = new Map([
    ["INSTALLATION_AND_UPGRADE.md", ["GitHub", "SHA-256", "skills-library-maintenance", "--global --copy -y"]],
    ["VERSIONING_AND_MIGRATIONS.md", ["Semantic versioning", "schema-lock.v1.json", "Deprecation", "not `v1.0.0`"]],
    ["PRIVACY.md", ["local-first", "localStorage", "local-only", "Netlify"]],
    ["RECOVERY.md", ["folder backup", "rollback-failed", "Public PR", "Git-connected Netlify Production"]],
    ["SECURITY.md", ["vulnerability", "skills@1.5.20", "release-gate"]],
    ["CONTRIBUTING.md", ["Schemas", "migration", "release gate"]],
  ]);
  for (const [fileName, tokens] of requirements) {
    const content = read(publicDocument(fileName));
    for (const token of tokens) assert.ok(content.includes(token), `${fileName} is missing ${token}.`);
  }
});
