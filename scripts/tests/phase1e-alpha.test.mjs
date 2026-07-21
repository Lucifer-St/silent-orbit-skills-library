import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildAlphaPreview } from "../build-alpha-preview.mjs";
import { containsPhase1EPrivateEvidence, phase1EDigest, validatePhase1EAlphaReceiptV1 } from "../lib/phase1e-alpha.mjs";
import {
  analyzeSilentOrbitProject,
  importSilentOrbitSource,
  initSilentOrbitProject,
  scanSilentOrbitProject,
  silentOrbitProjectFiles,
} from "../lib/silent-orbit-project.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = path.join(projectRoot, "fixtures", "phase1e-alpha");
const alphaRoot = path.join(projectRoot, "alpha", "phase1e");

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }

test("committed Alpha projection contains 44 reviewed Skills and a valid fixed-environment receipt", () => {
  const receipt = validatePhase1EAlphaReceiptV1(readJson(path.join(alphaRoot, "alpha-receipt.json")));
  const data = readJson(path.join(alphaRoot, "site-data.json"));
  const sourceLock = readJson(path.join(alphaRoot, "alpha-source-lock.json"));
  assert.equal(receipt.humanFeedback, false);
  assert.equal(data.siteManifest.summary.skills, 44);
  assert.equal(data.project.renderer.theme, "reference-index");
  assert.equal(sourceLock.skills.length, 44);
  assert.equal(sourceLock.selection.lockedCount, 49);
  assert.equal(sourceLock.selection.publicCount, 44);
  assert.equal(containsPhase1EPrivateEvidence({ receipt, data, sourceLock }), false);
  assert.ok(data.appData.skills.every((skill) => ["public", "creator-showcase"].includes(skill.visibility)));
  assert.doesNotMatch(JSON.stringify(data.appData.skills), /SKILL\.md body/i);
});

test("private Alpha fixtures reproduce 48 observed, 44 public, and exact V2 diff deterministically", { skip: !fs.existsSync(fixtures) }, async (t) => {
  const { runPhase1EAlpha } = await import("../run-phase1e-alpha.mjs");
  const firstOutput = fs.mkdtempSync(path.join(os.tmpdir(), "phase1e-alpha-first-"));
  const secondOutput = fs.mkdtempSync(path.join(os.tmpdir(), "phase1e-alpha-second-"));
  t.after(() => { fs.rmSync(firstOutput, { recursive: true, force: true }); fs.rmSync(secondOutput, { recursive: true, force: true }); });
  const first = runPhase1EAlpha({ fixtures, output: firstOutput });
  const second = runPhase1EAlpha({ fixtures, output: secondOutput });
  assert.deepEqual(first.receipt.counts, { observed: 48, inventory: 46, public: 44, reviewRequired: 2, localOnly: 2 });
  assert.deepEqual(first.receipt.diff.summary, { added: 1, changed: 3, removed: 1 });
  assert.deepEqual(first.receipt.postGenerateDiff.summary, { added: 0, changed: 0, removed: 0 });
  assert.equal(first.receipt.receiptId, second.receipt.receiptId);
  assert.equal(phase1EDigest(readJson(path.join(firstOutput, "site-data.json"))), phase1EDigest(readJson(path.join(secondOutput, "site-data.json"))));
});

test("the independent synthetic fixture is path-neutral across unrelated machine roots", { skip: !fs.existsSync(fixtures) }, (t) => {
  const roots = ["portable-root-a", "different-layout-b"].map((label) => fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)));
  t.after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));
  const snapshots = roots.map((root, index) => {
    const project = index ? path.join(root, "deep", "cosmos") : path.join(root, "cosmos");
    initSilentOrbitProject({ projectDirectory: project, title: "Portable Fixture", projectId: "portable-fixture" });
    importSilentOrbitSource({ projectDirectory: project, inputFile: path.join(fixtures, "synthetic.source-import.json") });
    fs.copyFileSync(path.join(fixtures, "synthetic.overrides.json"), path.join(project, silentOrbitProjectFiles.overrides));
    scanSilentOrbitProject({ projectDirectory: project, generatedAt: "2026-07-21T20:00:00.000Z" });
    const result = analyzeSilentOrbitProject({ projectDirectory: project });
    return {
      libraryDigest: phase1EDigest(result.librarySnapshot),
      manifestDigest: phase1EDigest(result.siteManifest),
      skills: result.librarySnapshot.skills.length,
    };
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.equal(snapshots[0].skills, 5);
});

test("Alpha preview build is static, private-safe, and keeps Map plus Library modes", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "phase1e-preview-"));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const result = buildAlphaPreview({ output });
  assert.equal(result.skills, 44);
  const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(output, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(output, "styles.css"), "utf8");
  assert.match(html, /data-view-target="map"/);
  assert.match(html, /data-view-target="library"/);
  assert.match(script, /animateViewBox/);
  assert.match(script, /ArrowDown/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.equal(containsPhase1EPrivateEvidence([html, script, styles]), false);
});

test("runtime-composed privacy canaries are detected without committing their literal values", () => {
  const privatePath = ["C:", "Users", "Example", "private"].join("\\");
  const longToken = ["s", "k-"].join("") + "example1234567890";
  const email = ["alpha", "example.test"].join("@");
  assert.equal(containsPhase1EPrivateEvidence({ privatePath, longToken, email }), true);
});
