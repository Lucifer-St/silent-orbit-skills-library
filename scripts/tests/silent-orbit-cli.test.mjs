import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runSilentOrbitCli, silentOrbitHelpText, silentOrbitVersion } from "../silent-orbit.mjs";
import {
  auditSilentOrbitProject,
  analyzeSilentOrbitProject,
  diffSilentOrbitProject,
  doctorSilentOrbitProject,
  generateSilentOrbitProject,
  importSilentOrbitSource,
  initSilentOrbitProject,
  scanSilentOrbitProject,
  silentOrbitProjectFiles,
} from "../lib/silent-orbit-project.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function temporaryRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-cli-${label}-`));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceImport(skills) {
  return {
    schemaVersion: 1,
    source: { key: "independent-library", label: "Independent Library", providerKind: "json-import", updateChannel: "unknown" },
    skills,
  };
}

test("CLI entry point exposes the expected v0.2 commands", () => {
  const help = silentOrbitHelpText();
  for (const command of ["init", "import", "scan", "analyze", "diff", "generate", "doctor", "audit"]) assert.match(help, new RegExp(`silent-orbit ${command}`));
  assert.equal(silentOrbitVersion, "0.2.0");
});

function fileSnapshot(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      return entry.isDirectory() ? fileSnapshot(root, next) : [{ path: next.split(path.sep).join("/"), bytes: fs.readFileSync(path.join(root, next)).toString("base64") }];
    });
}

test("audit --json checks only Skill health, tolerates provider failure, and performs zero project writes", (t) => {
  const parent = temporaryRoot("audit");
  const root = path.join(parent, "project");
  const fixtureRoot = path.join(projectDir, "fixtures", "phase4");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  initSilentOrbitProject({ projectDirectory: root, title: "Audit Fixture", projectId: "audit-fixture" });
  importSilentOrbitSource({ projectDirectory: root, inputFile: path.join(fixtureRoot, "source-managed.source-import.json") });
  importSilentOrbitSource({ projectDirectory: root, inputFile: path.join(fixtureRoot, "external-provider.source-import.json") });
  const configPath = path.join(root, silentOrbitProjectFiles.config);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.sources.push({
    key: "failed-provider",
    type: "skill-folder",
    label: "Failed Provider",
    path: "missing-provider",
    updateChannel: "unknown",
  });
  config.sources.sort((left, right) => left.key.localeCompare(right.key, "en"));
  writeJson(configPath, config);

  const doctorBefore = doctorSilentOrbitProject({ projectDirectory: root });
  assert.equal(doctorBefore.status, "error");
  assert.ok(doctorBefore.checks.some((check) => check.id === "inventory" && check.state === "missing"));
  const before = fileSnapshot(root);
  const programmatic = auditSilentOrbitProject({ projectDirectory: root, generatedAt: "2026-07-22T12:00:00.000Z" });
  assert.equal(programmatic.summary.sourceFailures, 1);
  assert.equal(programmatic.summary.skillIdentities, 6);
  assert.equal(fs.existsSync(path.join(root, silentOrbitProjectFiles.inventory)), false);
  assert.deepEqual(fileSnapshot(root), before);

  const result = runSilentOrbitCli(["audit", "--project", root, "--generated-at", "2026-07-22T12:00:00.000Z", "--json"]);
  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.reportId, programmatic.reportId);
  assert.equal(report.status, "error");
  assert.equal(report.summary.sourceFailures, 1);
  assert.equal(report.summary.duplicateIdentities, 1);
  assert.deepEqual(fileSnapshot(root), before);
  assert.deepEqual(doctorSilentOrbitProject({ projectDirectory: root }), doctorBefore);
});

test("init refuses to overwrite an existing project configuration", (t) => {
  const root = temporaryRoot("init");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initSilentOrbitProject({ projectDirectory: root, title: "Independent Library" });
  assert.throws(() => initSilentOrbitProject({ projectDirectory: root }), /refusing to overwrite/);
  assert.equal(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), ".silent-orbit/\n");
  const config = JSON.parse(fs.readFileSync(path.join(root, silentOrbitProjectFiles.config), "utf8"));
  assert.equal(config.project.renderer.theme, "reference-index");
});

test("fresh project completes init, import, scan, analyze, diff, generate, and doctor deterministically", (t) => {
  const parent = temporaryRoot("e2e");
  const root = path.join(parent, "portable-project");
  const importFile = path.join(parent, "input.json");
  const sentinel = path.join(parent, "outside-sentinel.txt");
  fs.writeFileSync(sentinel, "unchanged", "utf8");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  initSilentOrbitProject({ projectDirectory: root, title: "Independent Skill Library", projectId: "independent-skill-library" });
  writeJson(importFile, sourceImport([
    { name: "research-compass", visibility: "public", origin: "third-party", description: "Research sources and preserve citations.", trigger: "$research-compass" },
    { name: "image-studio", visibility: "public", origin: "third-party", description: "Create design and image concepts.", trigger: "$image-studio" },
    { name: "reviewed-helper", description: "A reviewed but uncategorized capability." },
    { name: "waiting-for-review", description: "Browser automation not yet approved." },
    { name: "private-helper", visibility: "local-only", description: "Private local capability." },
  ]));
  importSilentOrbitSource({ projectDirectory: root, inputFile: importFile });

  const overridesPath = path.join(root, silentOrbitProjectFiles.overrides);
  const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  overrides.governance.push({ sourceKey: "independent-library", name: "reviewed-helper", visibility: "public", origin: "third-party" });
  overrides.skillOverrides.push({ selector: { sourceKey: "independent-library", name: "reviewed-helper" }, description: "Runs an explicitly reviewed operational workflow.", categoryKeys: ["automation-operations"], primaryCategoryKey: "automation-operations" });
  overrides.collections.push({ key: "starter", kind: "curated", title: "Starter Set", skills: [{ sourceKey: "independent-library", name: "research-compass" }, { sourceKey: "independent-library", name: "reviewed-helper" }] });
  writeJson(overridesPath, overrides);

  const firstScan = scanSilentOrbitProject({ projectDirectory: root, generatedAt: "2026-07-21T16:00:00.000Z" });
  assert.equal(firstScan.snapshot.items.length, 4);
  assert.equal(firstScan.report.observedItems, 5);
  assert.equal(firstScan.report.reviewRequired, 1);
  assert.equal(firstScan.report.excludedLocalOnly, 1);
  const stableScan = scanSilentOrbitProject({ projectDirectory: root });
  assert.deepEqual(stableScan.snapshot, firstScan.snapshot);

  const analysis = analyzeSilentOrbitProject({ projectDirectory: root });
  assert.equal(analysis.librarySnapshot.skills.length, 3);
  assert.equal(analysis.analysisReport.summary.reviewRequired, 1);
  assert.equal(analysis.librarySnapshot.collections.length, 1);
  const baselineDiff = diffSilentOrbitProject({ projectDirectory: root });
  assert.equal(baselineDiff.summary.added, 3);

  const firstGenerate = generateSilentOrbitProject({ projectDirectory: root });
  assert.deepEqual(diffSilentOrbitProject({ projectDirectory: root }).summary, { added: 0, changed: 0, removed: 0 });
  const firstFiles = firstGenerate.receipt.files;
  const secondGenerate = generateSilentOrbitProject({ projectDirectory: root });
  assert.deepEqual(secondGenerate.receipt.files, firstFiles);
  assert.ok(fs.existsSync(path.join(root, "dist", "index.html")));
  assert.ok(fs.existsSync(path.join(root, "dist", "site-data.json")));
  assert.ok(fs.existsSync(path.join(root, "dist", "frontend-handoff.md")));
  assert.match(fs.readFileSync(path.join(root, "dist", "frontend-handoff.md"), "utf8"), /preferred frontend Skill and visual style/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "dist", "site-data.json"), "utf8"), /private-helper|waiting-for-review|[A-Za-z]:\\Users\\/i);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "unchanged");
  assert.equal(doctorSilentOrbitProject({ projectDirectory: root }).status, "ok");

  writeJson(importFile, sourceImport([
    { name: "research-compass", visibility: "public", origin: "third-party", description: "Research sources and preserve citations.", trigger: "$research-compass" },
    { name: "image-studio", visibility: "public", origin: "third-party", description: "Create design and image concepts.", trigger: "$image-studio" },
    { name: "reviewed-helper", description: "A reviewed but uncategorized capability." },
    { name: "waiting-for-review", description: "Browser automation not yet approved." },
    { name: "private-helper", visibility: "local-only", description: "Private local capability." },
    { name: "document-maker", visibility: "public", origin: "third-party", description: "Create a document and PDF.", trigger: "$document-maker" },
  ]));
  importSilentOrbitSource({ projectDirectory: root, inputFile: importFile });
  scanSilentOrbitProject({ projectDirectory: root, generatedAt: "2026-07-22T16:00:00.000Z" });
  analyzeSilentOrbitProject({ projectDirectory: root });
  const changed = diffSilentOrbitProject({ projectDirectory: root });
  assert.deepEqual(changed.added, ["document-maker"]);
  assert.equal(changed.summary.removed, 0);
  generateSilentOrbitProject({ projectDirectory: root });
  assert.deepEqual(diffSilentOrbitProject({ projectDirectory: root }).summary, { added: 0, changed: 0, removed: 0 });
  assert.equal(fs.readFileSync(sentinel, "utf8"), "unchanged");
});

test("generated files and receipts remain inside the selected project root", (t) => {
  const parent = temporaryRoot("boundary");
  const root = path.join(parent, "project");
  const inputFile = path.join(parent, "source.json");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  initSilentOrbitProject({ projectDirectory: root });
  writeJson(inputFile, sourceImport([{ name: "public-skill", visibility: "public", description: "Research sources." }]));
  importSilentOrbitSource({ projectDirectory: root, inputFile });
  scanSilentOrbitProject({ projectDirectory: root, generatedAt: "2026-07-21T18:00:00.000Z" });
  analyzeSilentOrbitProject({ projectDirectory: root });
  const generated = generateSilentOrbitProject({ projectDirectory: root });
  assert.ok(path.relative(root, generated.outputDirectory) === "dist");
  assert.ok(fs.readdirSync(parent).every((name) => ["project", "source.json"].includes(name)));
  assert.equal(fs.readdirSync(root).some((name) => name.startsWith(".silent-orbit-generate-")), false);
});
