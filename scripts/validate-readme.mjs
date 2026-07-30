import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readmeAssets = [
  "architecture.svg",
  "catalog.png",
  "hero.svg",
  "home.png",
  "inspector.png",
  "mobile-inspector.png",
  "social-preview.png",
];

function readPng(filePath, label) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${label} is not a valid PNG.`);
  }
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    chunks.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  for (const name of ["tEXt", "zTXt", "iTXt", "eXIf"]) {
    if (chunks.includes(name)) throw new Error(`${label} contains descriptive PNG metadata ${name}.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

function assertReadme(rootDir, fileName, { chinese = false } = {}) {
  const content = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  for (const required of [
    "./assets/readme/hero.svg",
    "./assets/readme/architecture.svg",
    "./assets/readme/home.png",
    "./assets/readme/catalog.png",
    "./assets/readme/inspector.png",
    "./assets/readme/mobile-inspector.png",
    "https://silent-orbit-skills-library.netlify.app/",
    "validate:public-repository",
  ]) {
    if (!content.includes(required)) throw new Error(`${fileName} is missing ${required}.`);
  }
  if (/{{[A-Z0-9_]+}}|github\.com\/oil-oil|README MADE WITH/i.test(content)) {
    throw new Error(`${fileName} contains an unresolved token or unauthorized attribution.`);
  }
  if (chinese && !content.includes("隐私边界")) throw new Error(`${fileName} is missing its Chinese privacy boundary.`);
  if (!chinese && !content.includes("Privacy boundary")) throw new Error(`${fileName} is missing its privacy boundary.`);
}

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertExactTarballChecksumInstructions(content, fileName, packageVersion) {
  const tarball = `silent-orbit-skills-library-${packageVersion}.tgz`;
  const escapedTarball = `${escapeRegexLiteral(tarball)}$`;
  for (const required of [
    escapedTarball,
    "$matches.Count -ne 1",
    "sha256sum --check -",
    "shasum -a 256",
  ]) {
    if (!content.includes(required)) throw new Error(`${fileName} is missing exact tarball checksum instruction ${required}.`);
  }

  const escapedTarballs = content.match(
    /silent-orbit-skills-library-\d+\\\.\d+\\\.\d+-beta\\\.\d+\\\.tgz\$/g,
  ) ?? [];
  if (escapedTarballs.length !== 1 || escapedTarballs[0] !== escapedTarball) {
    throw new Error(`${fileName} contains a stale, missing, or duplicate escaped tarball checksum pattern.`);
  }
  if (
    /Get-Content[^\r\n]*SHA256SUMS\.txt[^\r\n]*-split\s+['"]\\s\+['"][^\r\n]*\[0\]/i.test(content)
    || /\b(?:sha256sum\s+(?:-c|--check)|shasum\s+-a\s+256\s+(?:-c|--check))\s+(?:\.\/)?SHA256SUMS\.txt\b/i.test(content)
  ) {
    throw new Error(`${fileName} must not use the first checksum hash or verify a full sums file after partial asset download.`);
  }
}

function assertGeneratorQuickstart(rootDir, fileName, packageVersion, { chinese = false } = {}) {
  const content = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  for (const required of [
    `v${packageVersion}`,
    `silent-orbit-skills-library-${packageVersion}.tgz`,
    "silent-orbit init",
    "silent-orbit import",
    "silent-orbit scan",
    "silent-orbit analyze",
    "silent-orbit diff",
    "silent-orbit generate",
    "silent-orbit doctor",
    "silent-orbit audit",
    "silent-orbit manage plan",
    "--dry-run --json",
    "build-skill-cosmos",
    "audit-skill-cosmos",
    "manage-skill-cosmos",
    "skills-library-maintenance",
    "--global --copy -y",
    "$skillSource = (Resolve-Path -LiteralPath",
    "npx skills@1.5.20 add $skillSource",
    "review-required",
    "local-only",
    "44-Skill",
    "153-Skill",
  ]) {
    if (!content.includes(required)) throw new Error(`${fileName} is missing ${required}.`);
  }
  const prohibitedCommands = [
    /\bnpm\s+publish\b/i,
    /\bnpm\s+install\s+(?:--global|-g)\s+silent-orbit-skills-library(?:@|\s|$)/im,
    /\bnetlify\s+deploy(?:\s+--prod|\s+--dir|\s+--alias|$)/im,
    /\bnpx\s+skills(?:@1\.5\.20)?\s+add\s+\.\\node_modules\\silent-orbit-skills-library\b/im,
  ];
  if (prohibitedCommands.some((pattern) => pattern.test(content))) {
    throw new Error(`${fileName} contains a prohibited registry-publish, registry-install, or direct-deploy command.`);
  }
  if (chinese && !content.includes("首次生成")) throw new Error(`${fileName} is missing its Chinese first-generation section.`);
  if (!chinese && !content.includes("First generation")) throw new Error(`${fileName} is missing its first-generation section.`);
  assertExactTarballChecksumInstructions(content, fileName, packageVersion);
}

export function validateReadme(rootDir = projectDir) {
  const assetRoot = path.join(rootDir, "assets", "readme");
  for (const fileName of readmeAssets) {
    if (!fs.statSync(path.join(assetRoot, fileName), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`README asset is missing: assets/readme/${fileName}`);
    }
  }
  assertReadme(rootDir, "README.md");
  assertReadme(rootDir, "README.zh-CN.md", { chinese: true });
  const packageVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
  assertGeneratorQuickstart(rootDir, "docs/guides/generator-quickstart.md", packageVersion);
  assertGeneratorQuickstart(rootDir, "docs/guides/generator-quickstart.zh-CN.md", packageVersion, { chinese: true });

  const social = readPng(path.join(assetRoot, "social-preview.png"), "social-preview.png");
  if (social.width !== 1280 || social.height !== 640 || social.bytes >= 1_000_000) {
    throw new Error("social-preview.png must be 1280x640 and smaller than 1 MB.");
  }
  for (const fileName of readmeAssets.filter((name) => name.endsWith(".png") && name !== "social-preview.png")) {
    const screenshot = readPng(path.join(assetRoot, fileName), fileName);
    if (screenshot.width < 320 || screenshot.height < 320) throw new Error(`${fileName} is too small to prove the product UI.`);
  }
  console.log(`README validation passed. files=4 assets=${readmeAssets.length}`);
  return { readmes: 4, assets: readmeAssets.length };
}

function parseRoot(args) {
  const index = args.indexOf("--root");
  if (index === -1) return projectDir;
  if (!args[index + 1]) throw new Error("--root requires a directory.");
  return path.resolve(process.cwd(), args[index + 1]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateReadme(parseRoot(process.argv.slice(2)));
}
