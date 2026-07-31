import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeSilentOrbitProject,
  generateSilentOrbitProject,
  importSilentOrbitSource,
  initSilentOrbitProject,
  scanSilentOrbitProject,
} from "../lib/silent-orbit-project.mjs";
import {
  decideSkillCosmosCustomizationV2,
  doctorSkillCosmosCustomizationV2,
  prepareSkillCosmosCustomizationV2,
  refreshSkillCosmosCustomizationV2,
  skillCosmosCustomizationFiles,
  statusSkillCosmosCustomizationV2,
} from "../lib/skill-cosmos-customization.mjs";
import { runSilentOrbitCli } from "../silent-orbit.mjs";

function temporaryRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-customization-${label}-`));
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceImport(skills) {
  return {
    schemaVersion: 1,
    source: {
      key: "customization-fixture",
      label: "Customization Fixture",
      providerKind: "json-import",
      updateChannel: "unknown",
    },
    skills,
  };
}

function publicSkill(name, description = `${name} description`) {
  return {
    name,
    visibility: "public",
    origin: "third-party",
    description,
    trigger: `$${name}`,
  };
}

function createProject(parent, skills = [publicSkill("research-compass"), publicSkill("image-studio"), publicSkill("document-maker")]) {
  const root = path.join(parent, "project");
  const source = path.join(parent, "source.json");
  initSilentOrbitProject({ projectDirectory: root, title: "Personal Orbit", projectId: "personal-orbit" });
  writeJson(source, sourceImport(skills));
  importSilentOrbitSource({ projectDirectory: root, inputFile: source });
  scanSilentOrbitProject({ projectDirectory: root, generatedAt: "2026-07-30T12:00:00.000Z" });
  analyzeSilentOrbitProject({ projectDirectory: root });
  generateSilentOrbitProject({ projectDirectory: root });
  return { root, source };
}

function profile(revision = 1, updatedAt = "2026-07-30T13:00:00.000Z") {
  return {
    schemaVersion: 2,
    kind: "DesignProfileV2",
    profileId: "matthew-aesthetic",
    revision,
    createdAt: "2026-07-30T13:00:00.000Z",
    updatedAt,
    preferences: {
      references: ["one-bit cosmic archive", "quiet editorial tools"],
      antiReferences: ["generic card dashboard"],
      qualities: ["private", "precise", "alive"],
      density: "balanced",
      navigation: "map-first",
      typography: "editorial",
      colorIntent: ["monochrome", "one signal accent"],
      motion: "measured",
      accessibility: {
        highContrast: true,
        reducedMotion: true,
        mobilePriority: "equal",
      },
    },
  };
}

function directions(suffix = "") {
  return [
    {
      id: `quiet-orbit${suffix}`,
      label: "Quiet Orbit",
      rationale: "Keeps the library calm, editorial, and map-led.",
      layout: "editorial-rail",
      density: "airy",
      typography: "editorial",
      motion: "still",
      shape: "square",
      palette: {
        paper: "#ffffff",
        ink: "#050505",
        muted: "#666666",
        line: "#d8d8d8",
        accent: "#0068b5",
      },
    },
    {
      id: `signal-grid${suffix}`,
      label: "Signal Grid",
      rationale: "Makes scanning faster with a compact technical grid.",
      layout: "signal-grid",
      density: "compact",
      typography: "technical",
      motion: "expressive",
      shape: "soft",
      palette: {
        paper: "#f7f7f2",
        ink: "#111111",
        muted: "#575757",
        line: "#c7c7be",
        accent: "#b13c12",
      },
    },
  ];
}

function prepareRequest() {
  return {
    schemaVersion: 2,
    generatedAt: "2026-07-30T13:00:00.000Z",
    profile: profile(),
    directions: directions(),
  };
}

function fileDigests(root, excluded = new Set()) {
  const result = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else {
        const relative = path.relative(root, target).split(path.sep).join("/");
        if (!excluded.has(relative)) {
          result.set(relative, createHash("sha256").update(fs.readFileSync(target)).digest("hex"));
        }
      }
    }
  };
  visit(root);
  return result;
}

test("prepare creates exactly two substantive functional previews and private state", (t) => {
  const parent = temporaryRoot("prepare");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const before = statusSkillCosmosCustomizationV2({ projectDirectory: root });
  assert.equal(before.status, "not-prepared");
  const prepared = prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest() });
  assert.equal(prepared.status, "succeeded");
  assert.equal(prepared.directions.length, 2);
  assert.notEqual(prepared.directions[0].styleDigest, prepared.directions[1].styleDigest);
  for (const direction of prepared.directions) {
    const preview = path.join(root, ...direction.previewDirectory.split("/"));
    for (const relative of ["index.html", "app.js", "styles.css", "customization.css", "site-data.json", "frontend-handoff.v2.json", "custom-frontend.manifest.json"]) {
      assert.ok(fs.existsSync(path.join(preview, relative)), relative);
    }
  }
  const signalGridCss = fs.readFileSync(
    path.join(root, ...prepared.directions.find((entry) => entry.id === "signal-grid").previewDirectory.split("/"), "customization.css"),
    "utf8",
  );
  assert.match(signalGridCss, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(signalGridCss, /\.filter-panel \{[\s\S]*height: auto;[\s\S]*overflow: visible;/);
  assert.match(signalGridCss, /translateX\(calc\(101% \+ 2vw\)\)/);
  assert.match(signalGridCss, /\.skill-copy strong \{[\s\S]*font-family: var\(--custom-display\)/);
  const privateState = fs.readFileSync(path.join(root, skillCosmosCustomizationFiles.state), "utf8");
  assert.doesNotMatch(privateState, /rawInterview|prompt|[A-Za-z]:\\Users\\/i);
  assert.equal(fs.existsSync(path.join(root, "customization", "current")), false);
  const beforeDoctor = fileDigests(root);
  assert.equal(doctorSkillCosmosCustomizationV2({ projectDirectory: root }).status, "attention");
  assert.deepEqual(fileDigests(root), beforeDoctor, "customize doctor must remain read-only");
});

test("reject, adjust, and keep preserve immutable history and promote only an active candidate", (t) => {
  const parent = temporaryRoot("decisions");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest() });
  const rejected = decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T13:10:00.000Z",
      action: "reject",
      directionId: "quiet-orbit",
      feedback: ["Too spacious for daily scanning."],
    },
  });
  assert.equal(rejected.action, "reject");
  assert.throws(
    () => decideSkillCosmosCustomizationV2({
      projectDirectory: root,
      request: {
        schemaVersion: 2,
        generatedAt: "2026-07-30T13:11:00.000Z",
        action: "keep",
        directionId: "quiet-orbit",
        feedback: [],
      },
    }),
    /only an active candidate/,
  );
  const adjustedDirection = {
    ...directions()[1],
    id: "signal-grid-r2",
    label: "Signal Grid R2",
    rationale: "Keeps the fast grid while reducing visual movement.",
    motion: "measured",
  };
  const adjusted = decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T13:20:00.000Z",
      action: "adjust",
      directionId: "signal-grid",
      feedback: ["Keep the grid but make motion quieter."],
      direction: adjustedDirection,
    },
  });
  assert.equal(adjusted.directionId, "signal-grid-r2");
  const kept = decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T13:30:00.000Z",
      action: "keep",
      directionId: "signal-grid-r2",
      feedback: ["This is the right daily-use direction."],
    },
  });
  assert.equal(kept.current.directionId, "signal-grid-r2");
  assert.equal(fs.existsSync(path.join(root, "customization", "current", "index.html")), true);
  const state = JSON.parse(fs.readFileSync(path.join(root, skillCosmosCustomizationFiles.state), "utf8"));
  assert.equal(state.rounds[0].directions.find((entry) => entry.id === "quiet-orbit").status, "rejected");
  assert.equal(state.rounds[0].directions.find((entry) => entry.id === "signal-grid").status, "superseded");
  assert.equal(state.rounds[0].directions.find((entry) => entry.id === "signal-grid-r2").status, "selected");
  assert.deepEqual(state.rounds[0].decisions.map((entry) => entry.action), ["reject", "adjust", "keep"]);
  assert.equal(doctorSkillCosmosCustomizationV2({ projectDirectory: root }).status, "ok");
});

test("redo preserves the old round and may advance the summarized profile one revision", (t) => {
  const parent = temporaryRoot("redo");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const prepared = prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest() });
  const redone = decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T14:00:00.000Z",
      action: "redo",
      feedback: ["Both options need a warmer reading rhythm."],
      profile: profile(2, "2026-07-30T14:00:00.000Z"),
      directions: directions("-redo"),
    },
  });
  assert.notEqual(redone.roundId, prepared.roundId);
  const state = JSON.parse(fs.readFileSync(path.join(root, skillCosmosCustomizationFiles.state), "utf8"));
  assert.equal(state.profileRef.revision, 2);
  assert.equal(state.rounds.length, 2);
  assert.equal(state.rounds[0].status, "closed");
  assert.equal(state.rounds[1].status, "open");
  assert.deepEqual(state.rounds[1].inheritedFeedback, ["Both options need a warmer reading rhythm."]);
  assert.equal(fs.existsSync(path.join(root, "customization", "rounds", prepared.roundId)), true);
});

test("refresh changes only managed data and preserves every style-owned digest", (t) => {
  const parent = temporaryRoot("refresh");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root, source } = createProject(parent);
  prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest() });
  decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T13:30:00.000Z",
      action: "keep",
      directionId: "quiet-orbit",
      feedback: ["Keep this direction."],
    },
  });
  const current = path.join(root, "customization", "current");
  const excluded = new Set(["site-data.json", "frontend-handoff.v2.json", "custom-frontend.manifest.json"]);
  const before = fileDigests(current, excluded);
  writeJson(source, sourceImport([
    publicSkill("research-compass"),
    publicSkill("image-studio"),
    publicSkill("document-maker"),
    publicSkill("browser-research"),
  ]));
  importSilentOrbitSource({ projectDirectory: root, inputFile: source });
  scanSilentOrbitProject({ projectDirectory: root, generatedAt: "2026-07-31T12:00:00.000Z" });
  analyzeSilentOrbitProject({ projectDirectory: root });
  generateSilentOrbitProject({ projectDirectory: root });
  assert.equal(doctorSkillCosmosCustomizationV2({ projectDirectory: root }).status, "attention");
  const refreshed = refreshSkillCosmosCustomizationV2({
    projectDirectory: root,
    generatedAt: "2026-07-31T12:30:00.000Z",
  });
  assert.equal(refreshed.stylePreserved, true);
  assert.deepEqual(fileDigests(current, excluded), before);
  const siteData = JSON.parse(fs.readFileSync(path.join(current, "site-data.json"), "utf8"));
  assert.equal(siteData.appData.skills.length, 4);
  assert.equal(doctorSkillCosmosCustomizationV2({ projectDirectory: root }).status, "ok");
});

test("prepare rejects color-only options and refresh stops on style drift", (t) => {
  const parent = temporaryRoot("negative");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const colorOnly = directions();
  colorOnly[1] = {
    ...colorOnly[0],
    id: "quiet-orbit-blue",
    label: "Quiet Orbit Blue",
    rationale: "Only changes the color.",
    palette: { ...colorOnly[0].palette, accent: "#a00000" },
  };
  assert.throws(
    () => prepareSkillCosmosCustomizationV2({
      projectDirectory: root,
      request: { ...prepareRequest(), directions: colorOnly },
    }),
    /at least two structural axes/,
  );
  prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest() });
  decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T13:30:00.000Z",
      action: "keep",
      directionId: "quiet-orbit",
      feedback: ["Keep this direction."],
    },
  });
  const current = path.join(root, "customization", "current");
  fs.appendFileSync(path.join(current, "customization.css"), "\n/* unreviewed drift */\n", "utf8");
  const beforeSiteData = fs.readFileSync(path.join(current, "site-data.json"));
  assert.throws(
    () => refreshSkillCosmosCustomizationV2({
      projectDirectory: root,
      generatedAt: "2026-07-31T12:30:00.000Z",
    }),
    /style digest is stale/,
  );
  assert.deepEqual(fs.readFileSync(path.join(current, "site-data.json")), beforeSiteData);
});

test("CLI executes prepare, decision, status, and doctor through JSON request files", (t) => {
  const parent = temporaryRoot("cli");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const prepareFile = path.join(parent, "prepare.json");
  const keepFile = path.join(parent, "keep.json");
  writeJson(prepareFile, prepareRequest());
  const prepared = runSilentOrbitCli([
    "customize",
    "prepare",
    "--project",
    root,
    "--request",
    prepareFile,
    "--json",
  ]);
  assert.equal(prepared.exitCode, 0);
  assert.equal(JSON.parse(prepared.stdout).directions.length, 2);
  writeJson(keepFile, {
    schemaVersion: 2,
    generatedAt: "2026-07-30T13:30:00.000Z",
    action: "keep",
    directionId: "quiet-orbit",
    feedback: ["Keep this direction."],
  });
  const kept = runSilentOrbitCli([
    "customize",
    "decide",
    "--project",
    root,
    "--request",
    keepFile,
    "--json",
  ]);
  assert.equal(kept.exitCode, 0);
  assert.equal(JSON.parse(kept.stdout).current.directionId, "quiet-orbit");
  const status = runSilentOrbitCli(["customize", "status", "--project", root, "--json"]);
  assert.equal(status.result.status, "current");
  const doctor = runSilentOrbitCli(["customize", "doctor", "--project", root, "--json"]);
  assert.equal(doctor.exitCode, 0);
  assert.equal(doctor.result.status, "ok");
});
