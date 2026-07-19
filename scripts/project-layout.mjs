import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function isFlatPublicLayout(rootDir = projectDir) {
  return fs.existsSync(path.join(rootDir, "data", "skills.json"));
}

export function resolveDataDir(rootDir = projectDir) {
  if (process.env.SKILLS_LIBRARY_DATA_DIR) {
    return path.resolve(rootDir, process.env.SKILLS_LIBRARY_DATA_DIR);
  }

  if (isFlatPublicLayout(rootDir)) {
    return path.join(rootDir, "data");
  }

  return path.resolve(rootDir, "..", "..", "outputs", "data");
}

export function resolveBuildDir(rootDir = projectDir) {
  if (process.env.SKILLS_LIBRARY_BUILD_DIR) {
    return path.resolve(rootDir, process.env.SKILLS_LIBRARY_BUILD_DIR);
  }

  return isFlatPublicLayout(rootDir)
    ? path.join(rootDir, "dist")
    : path.resolve(rootDir, "..", "..", "outputs", "skill-map-site");
}

export function resolveVisualQaContext(rootDir = projectDir) {
  if (isFlatPublicLayout(rootDir)) {
    return {
      outputDir: path.join(rootDir, ".qa-output"),
      stableEvidenceDir: path.join(rootDir, ".qa-evidence"),
      profileDir: path.join(rootDir, ".chrome-visual-qa-profile"),
      sourceCommit: readManifestCommit(rootDir),
    };
  }

  const workspaceDir = path.resolve(rootDir, "..", "..");
  return {
    outputDir: path.join(workspaceDir, "outputs", "skill-map-site-v04-librarian-qa"),
    stableEvidenceDir: path.join(rootDir, "docs", "design-assets", "v04-mvp", "implementation"),
    profileDir: path.join(rootDir, ".chrome-visual-qa-profile"),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceDir,
      encoding: "utf8",
    }).trim(),
  };
}

function readManifestCommit(rootDir) {
  const manifestPath = path.join(rootDir, "PUBLIC_RELEASE_MANIFEST.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Flat Public RC is missing PUBLIC_RELEASE_MANIFEST.json.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!/^[0-9a-f]{40}$/.test(manifest.inputCommit ?? "")) {
    throw new Error("PUBLIC_RELEASE_MANIFEST.json has an invalid inputCommit.");
  }
  return manifest.inputCommit;
}
