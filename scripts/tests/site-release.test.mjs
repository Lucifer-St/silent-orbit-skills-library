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

function publicDocument(fileName) {
  const sourcePath = `docs/public-release/${fileName}`;
  return fs.existsSync(path.join(projectDir, ...sourcePath.split("/"))) ? sourcePath : fileName;
}

function issueTemplate(fileName) {
  const sourcePath = `docs/public-release/github/ISSUE_TEMPLATE/${fileName}`;
  return fs.existsSync(path.join(projectDir, ...sourcePath.split("/")))
    ? sourcePath
    : `.github/ISSUE_TEMPLATE/${fileName}`;
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
    '<html lang="en">',
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

test("public beta materials cover tasks, severity, privacy, and both issue forms", () => {
  const testing = read(publicDocument("BETA_TESTING.md"));
  for (let task = 1; task <= 7; task += 1) assert.match(testing, new RegExp(`^${task}\\.`, "m"));
  for (const severity of ["P0", "P1", "P2", "Idea"]) assert.ok(testing.includes(severity));
  assert.match(testing, /no third-party analytics, cookies, or behavior tracking/i);
  assert.match(testing, /Safari is an external beta check/i);

  const feedback = read(publicDocument("BETA_FEEDBACK_TEMPLATE.md"));
  for (const prompt of ["Most confusing", "Liked most", "Most wanted to click"]) assert.ok(feedback.includes(prompt));
  for (const template of ["bug_report.yml", "experience_feedback.yml"]) {
    const body = read(issueTemplate(template));
    assert.match(body, /^name:/m);
    assert.match(body, /public-beta/);
    assert.doesNotMatch(body, /email|account id/i);
  }
});

test("beta version, root-safe Vite base, and publication handoff are explicit", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.version, "0.11.0-beta.4");
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
  assert.equal(lock.releaseVersion, "0.11.0-beta.4");
  assert.equal(lock.cliInterfaceVersion, "0.4.0");
  assert.equal(lock.compatibilityFamily, "v1");
  assert.equal(lock.hashAlgorithm, "sha256");
  assert.equal(lock.lineEnding, "LF");

  const schemaDir = path.join(projectDir, "schemas");
  const actualNames = fs.readdirSync(schemaDir)
    .filter((name) => name.endsWith(".schema.json"))
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
