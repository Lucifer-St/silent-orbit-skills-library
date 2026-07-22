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

function assertGeneratorQuickstart(rootDir, fileName, { chinese = false } = {}) {
  const content = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  for (const required of [
    "v0.10.0-beta.1",
    "silent-orbit-skills-library-0.10.0-beta.1.tgz",
    "silent-orbit init",
    "silent-orbit import",
    "silent-orbit scan",
    "silent-orbit analyze",
    "silent-orbit diff",
    "silent-orbit generate",
    "silent-orbit doctor",
    "silent-orbit audit",
    "build-skill-cosmos",
    "audit-skill-cosmos",
    "$skillSource = (Resolve-Path -LiteralPath",
    "npx skills add $skillSource",
    "review-required",
    "local-only",
    "44-Skill",
    "142-Skill",
  ]) {
    if (!content.includes(required)) throw new Error(`${fileName} is missing ${required}.`);
  }
  const prohibitedCommands = [
    /\bnpm\s+publish\b/i,
    /\bnpm\s+install\s+(?:--global|-g)\s+silent-orbit-skills-library(?:@|\s|$)/im,
    /\bnetlify\s+deploy(?:\s+--prod|\s+--dir|\s+--alias|$)/im,
    /\bnpx\s+skills\s+add\s+\.\\node_modules\\silent-orbit-skills-library\b/im,
  ];
  if (prohibitedCommands.some((pattern) => pattern.test(content))) {
    throw new Error(`${fileName} contains a prohibited registry-publish, registry-install, or direct-deploy command.`);
  }
  if (chinese && !content.includes("首次生成")) throw new Error(`${fileName} is missing its Chinese first-generation section.`);
  if (!chinese && !content.includes("First generation")) throw new Error(`${fileName} is missing its first-generation section.`);
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
  assertGeneratorQuickstart(rootDir, "GENERATOR_QUICKSTART.md");
  assertGeneratorQuickstart(rootDir, "GENERATOR_QUICKSTART.zh-CN.md", { chinese: true });

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
