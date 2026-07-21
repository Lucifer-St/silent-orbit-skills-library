#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsPhase1EPrivateEvidence } from "./lib/phase1e-alpha.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(projectRoot, "templates", "reference-index-v1");
const alphaRoot = path.join(projectRoot, "alpha", "phase1e");
const outputRoot = path.join(projectRoot, "dist");

function invariant(condition, message) { if (!condition) throw new Error(`Alpha preview build violation: ${message}`); }

export function buildAlphaPreview({ output = outputRoot } = {}) {
  const publicArtifacts = ["site-data.json", "frontend-handoff.md"];
  invariant(fs.existsSync(templateRoot) && publicArtifacts.every((name) => fs.existsSync(path.join(alphaRoot, name))), "Alpha artifacts are missing; run npm run alpha:acceptance first.");
  if (fs.existsSync(output)) fs.rmSync(output, { recursive: true, force: true });
  fs.cpSync(templateRoot, output, { recursive: true });
  for (const name of publicArtifacts) fs.copyFileSync(path.join(alphaRoot, name), path.join(output, name));
  const outputFiles = fs.readdirSync(output, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
  const payload = outputFiles
    .filter((filePath) => /\.(?:html|css|js|json|md|txt)$/i.test(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  invariant(!containsPhase1EPrivateEvidence(payload), "generated Preview contains private evidence.");
  const siteData = JSON.parse(fs.readFileSync(path.join(output, "site-data.json"), "utf8"));
  invariant(siteData.siteManifest.summary.skills === 44, "Preview must contain exactly 44 reviewed Skills.");
  return {
    output,
    skills: 44,
    files: outputFiles.map((filePath) => path.relative(output, filePath).replace(/\\/g, "/")).sort(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(buildAlphaPreview(), null, 2)}\n`);
}
