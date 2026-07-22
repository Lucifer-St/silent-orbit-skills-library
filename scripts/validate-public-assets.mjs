import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { visualAssetPolicy } from "./public-release-config.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function collectFiles(rootDir, relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in public assets: ${relativePath}`);
      if (entry.isDirectory()) return collectFiles(rootDir, relativePath);
      if (!entry.isFile()) throw new Error(`Unsupported public asset entry: ${relativePath}`);
      return [relativePath];
    });
}

function readPng(bytes, relativePath) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${relativePath} is not a valid PNG.`);
  }

  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset + 12 + length > bytes.length) throw new Error(`${relativePath} contains a truncated PNG chunk.`);
    chunks.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }

  for (const descriptiveChunk of ["tEXt", "zTXt", "iTXt", "eXIf"]) {
    if (chunks.includes(descriptiveChunk)) {
      throw new Error(`${relativePath} contains disallowed descriptive metadata chunk ${descriptiveChunk}.`);
    }
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    pngChunks: [...new Set(chunks)].sort(),
    c2paEmbedded: chunks.includes("caBX"),
  };
}

export function validatePublicAssets(rootDir = projectDir) {
  const provenancePath = path.join(rootDir, "ASSET_PROVENANCE.json");
  if (!fs.existsSync(provenancePath)) throw new Error("ASSET_PROVENANCE.json is required.");
  const provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  if (provenance.schemaVersion !== 1) throw new Error("ASSET_PROVENANCE.json schemaVersion must be 1.");
  if (provenance.visualAssetPolicy !== visualAssetPolicy) throw new Error("Visual asset policy text does not match the release contract.");
  if (!Array.isArray(provenance.assets)) throw new Error("ASSET_PROVENANCE.json assets must be an array.");

  const trackedFiles = [
    ...collectFiles(rootDir, "assets/readme"),
    ...collectFiles(rootDir, "public/assets"),
    ...collectFiles(rootDir, "public/fonts").filter((file) => file !== "public/fonts/README.md"),
    ...collectFiles(rootDir, "templates/reference-index-v1/fonts"),
  ].sort((left, right) => left.localeCompare(right, "en"));
  const records = [...provenance.assets].sort((left, right) => left.path.localeCompare(right.path, "en"));
  const recordPaths = records.map((record) => record.path);
  if (new Set(recordPaths).size !== recordPaths.length) throw new Error("ASSET_PROVENANCE.json contains duplicate paths.");
  if (JSON.stringify(recordPaths) !== JSON.stringify(trackedFiles)) {
    throw new Error("ASSET_PROVENANCE.json must cover every published visual/font/license asset exactly once.");
  }

  const disallowedOrigin = ["legacy", "external", "chat"].join("-");
  let pngCount = 0;
  let c2paCount = 0;
  for (const record of records) {
    if (typeof record.source !== "string" || record.source.length === 0) throw new Error(`${record.path} is missing a provenance source.`);
    if ((record.origin ?? "").toLowerCase() === disallowedOrigin) throw new Error(`${record.path} uses a forbidden asset origin.`);
    const absolutePath = path.join(rootDir, ...record.path.split("/"));
    const bytes = fs.readFileSync(absolutePath);
    if (record.bytes !== bytes.length) throw new Error(`${record.path} byte count does not match provenance.`);
    if (record.sha256 !== sha256(bytes)) throw new Error(`${record.path} hash does not match provenance.`);
    if (record.path.endsWith(".png")) {
      const metadata = readPng(bytes, record.path);
      if (record.width !== metadata.width || record.height !== metadata.height) {
        throw new Error(`${record.path} dimensions do not match provenance.`);
      }
      if (Boolean(record.c2paEmbedded) !== metadata.c2paEmbedded) {
        throw new Error(`${record.path} C2PA provenance flag does not match the PNG.`);
      }
      pngCount += 1;
      if (metadata.c2paEmbedded) c2paCount += 1;
    } else if (record.path.endsWith(".svg")) {
      const svg = bytes.toString("utf8");
      if (!/<svg\b/.test(svg) || !/\bviewBox="0 0 \d+ \d+"/.test(svg) || !/<title\b/.test(svg) || !/<desc\b/.test(svg)) {
        throw new Error(`${record.path} is missing the required SVG canvas, title, or description.`);
      }
      if (/<script\b|<foreignObject\b|@import|(?:href|xlink:href|src)=["']https?:\/\//i.test(svg)) {
        throw new Error(`${record.path} contains a GitHub-unsafe or remote SVG feature.`);
      }
    }
  }

  const report = { files: records.length, pngs: pngCount, c2paEmbedded: c2paCount };
  console.log(`Public asset validation passed. files=${report.files} pngs=${report.pngs} c2paEmbedded=${report.c2paEmbedded}`);
  return report;
}

function parseRoot(args) {
  const index = args.indexOf("--root");
  if (index === -1) return projectDir;
  if (!args[index + 1]) throw new Error("--root requires a directory.");
  return path.resolve(process.cwd(), args[index + 1]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validatePublicAssets(parseRoot(process.argv.slice(2)));
}
