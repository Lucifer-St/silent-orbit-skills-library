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
  const files = [
    [path.join(templateRoot, "index.html"), path.join(output, "index.html")],
    [path.join(templateRoot, "styles.css"), path.join(output, "styles.css")],
    [path.join(templateRoot, "app.js"), path.join(output, "app.js")],
    [path.join(alphaRoot, "site-data.json"), path.join(output, "site-data.json")],
    [path.join(alphaRoot, "frontend-handoff.md"), path.join(output, "frontend-handoff.md")],
  ];
  invariant(files.every(([source]) => fs.existsSync(source)), "Alpha artifacts are missing; run npm run alpha:acceptance first.");
  if (fs.existsSync(output)) fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const [source, target] of files) fs.copyFileSync(source, target);
  const payload = files.map(([, target]) => fs.readFileSync(target, "utf8")).join("\n");
  invariant(!containsPhase1EPrivateEvidence(payload), "generated Preview contains private evidence.");
  const siteData = JSON.parse(fs.readFileSync(path.join(output, "site-data.json"), "utf8"));
  invariant(siteData.siteManifest.summary.skills === 44, "Preview must contain exactly 44 reviewed Skills.");
  return { output, skills: 44, files: files.map(([, target]) => path.basename(target)).sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(buildAlphaPreview(), null, 2)}\n`);
}
