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
  assertStructuralRedesignV3,
  classifyCustomizationFeedbackV3,
  createCustomizationExperienceV3,
  decideSkillCosmosCustomizationV2,
  doctorSkillCosmosCustomizationV2,
  prepareSkillCosmosCustomizationV2,
  refreshSkillCosmosCustomizationV2,
  respondSkillCosmosCustomizationV3,
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

function contrastRatio(first, second) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((pair) => Number.parseInt(pair, 16) / 255).map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function cssVariable(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6});`, "iu"));
  assert.ok(match, `generated CSS is missing --${name}`);
  return match[1].toLowerCase();
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

function profile(revision = 1, updatedAt = "2026-07-30T13:00:00.000Z", navigation = "map-first") {
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
      navigation,
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

function prepareRequest(navigation = "map-first") {
  return {
    schemaVersion: 2,
    generatedAt: "2026-07-30T13:00:00.000Z",
    profile: profile(1, "2026-07-30T13:00:00.000Z", navigation),
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
    for (const relative of ["index.html", "app.js", "styles.css", "customization.css", "customization-experience.v3.json", "site-data.json", "frontend-handoff.v2.json", "custom-frontend.manifest.json"]) {
      assert.ok(fs.existsSync(path.join(preview, relative)), relative);
    }
    const experience = JSON.parse(fs.readFileSync(path.join(preview, "customization-experience.v3.json"), "utf8"));
    assert.equal(experience.preferredView, "map");
    assert.equal(experience.structure.source, "public-site-data");
    assert.ok(experience.structure.groups.length > 0);
    assert.ok(experience.structure.edges.length > 0);
  }
  assert.notEqual(prepared.directions[0].structureDigest, prepared.directions[1].structureDigest);
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
  const previousExperiences = prepared.directions.map((direction) => JSON.parse(fs.readFileSync(
    path.join(root, ...direction.previewDirectory.split("/"), "customization-experience.v3.json"),
    "utf8",
  )));
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
  const nextExperiences = state.rounds[1].directions.map((direction) => JSON.parse(fs.readFileSync(
    path.join(root, "customization", "rounds", state.rounds[1].id, direction.id, "customization-experience.v3.json"),
    "utf8",
  )));
  assert.equal(assertStructuralRedesignV3(previousExperiences, nextExperiences), true);
  assert.ok(nextExperiences.every((experience) => previousExperiences.every((previous) => experience.structureDigest !== previous.structureDigest)));
  const phaseOnly = previousExperiences.map((experience, index) => {
    const clone = structuredClone(experience);
    clone.roundId = `phase-only-${index}`;
    clone.structure.layoutPhase = Number(((clone.structure.layoutPhase + 0.125) % 1).toFixed(8));
    clone.structureDigest = createHash("sha256").update(`${JSON.stringify(clone.structure, null, 2)}\n`).digest("hex");
    return clone;
  });
  assert.throws(() => assertStructuralRedesignV3(previousExperiences, phaseOnly), /layoutPhase-only/u);
});

test("dark direction keeps fixed surfaces and inverse states readable", (t) => {
  const parent = temporaryRoot("dark-contrast");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const request = prepareRequest();
  request.directions[1].palette = {
    paper: "#0b0c0e",
    ink: "#ffffff",
    muted: "#c9cdd3",
    line: "#69717d",
    accent: "#ffcc00",
  };

  const prepared = prepareSkillCosmosCustomizationV2({ projectDirectory: root, request });
  const darkDirection = prepared.directions.find((entry) => entry.id === "signal-grid");
  assert.ok(darkDirection);
  const preview = path.join(root, ...darkDirection.previewDirectory.split("/"));
  const baseCss = fs.readFileSync(path.join(preview, "styles.css"), "utf8");
  const customCss = fs.readFileSync(path.join(preview, "customization.css"), "utf8");

  const generatedPalette = Object.fromEntries(["paper", "ink", "muted", "line", "accent"].map((name) => [name, cssVariable(customCss, name)]));
  assert.deepEqual(generatedPalette, request.directions[1].palette);
  assert.ok(contrastRatio(generatedPalette.paper, generatedPalette.ink) >= 4.5, "body ink on paper must meet WCAG AA");
  assert.ok(contrastRatio(generatedPalette.paper, generatedPalette.muted) >= 4.5, "muted text on paper must meet WCAG AA");
  assert.ok(contrastRatio(generatedPalette.paper, generatedPalette.accent) >= 4.5, "inverse paper text on accent must meet WCAG AA");
  assert.match(baseCss, /\.topbar\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--paper\) 98%, transparent\)/su);
  assert.match(baseCss, /\.focus-title\s*\{\s*fill:\s*var\(--paper\)/u);
  assert.match(baseCss, /\.focus-count\s*\{\s*fill:\s*var\(--paper\)/u);
  assert.match(baseCss, /\.map-skill-node\.is-active[^}]*fill:\s*var\(--paper\)/su);
  assert.match(baseCss, /\.skill-row\[aria-selected="true"\][^}]*color:\s*var\(--paper\)/su);
  assert.match(baseCss, /\.apply-button[^}]*color:\s*var\(--paper\)/su);
  assert.doesNotMatch(baseCss, /(?:fill|color):\s*#fff(?:fff)?\b/iu);
});

test("library-first controls the generated default while explicit runtime view stays distinct", (t) => {
  const parent = temporaryRoot("library-first");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const prepared = prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest("library-first") });
  for (const direction of prepared.directions) {
    assert.equal(direction.preferredView, "library");
    const preview = path.join(root, ...direction.previewDirectory.split("/"));
    const index = fs.readFileSync(path.join(preview, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(preview, "app.js"), "utf8");
    const experience = JSON.parse(fs.readFileSync(path.join(preview, "customization-experience.v3.json"), "utf8"));
    assert.match(index, /class="app-shell" data-view="library"/);
    assert.equal(experience.preferredView, "library");
    assert.match(app, /state\.view !== state\.preferredView/);
    assert.match(app, /explicit-url-over-preference|requestedView/);
  }
  const kept = decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-07-30T13:30:00.000Z",
      action: "keep",
      directionId: prepared.directions[0].id,
      feedback: ["Keep the library-led direction."],
    },
  });
  assert.equal(kept.current.directionId, prepared.directions[0].id);
  const currentExperience = JSON.parse(fs.readFileSync(path.join(root, "customization", "current", "customization-experience.v3.json"), "utf8"));
  assert.equal(currentExperience.preferredView, "library");
  refreshSkillCosmosCustomizationV2({ projectDirectory: root, generatedAt: "2026-07-30T13:40:00.000Z" });
  const refreshedExperience = JSON.parse(fs.readFileSync(path.join(root, "customization", "current", "customization-experience.v3.json"), "utf8"));
  assert.equal(refreshedExperience.preferredView, "library");
});

test("redesign rejects a CSS-only change that reuses the same structure", () => {
  const experience = {
    schemaVersion: 3,
    kind: "CustomizationExperienceV3",
    profileRef: { profileId: "profile", revision: 1 },
    roundId: "round-a",
    directionId: "direction-a",
    preferredView: "map",
    runtimeViewPolicy: "explicit-url-over-preference",
    refreshPolicy: "rederive-from-public-site-data",
    feedbackSignals: ["map-redesign"],
    structure: {
      source: "public-site-data",
      groupingStrategy: "category-chapters",
      layoutStrategy: "reading-lanes",
      layoutPhase: 0.25,
      edgePolicy: "public-membership-only",
      world: { width: 1200, height: 800 },
      groups: [{ id: "group-a", label: "Research", kind: "category", skillNames: ["skill-a"], x: 20, y: 20, width: 300, height: 160 }],
      nodes: [{ id: "skill-node-a", skillName: "skill-a", groupId: "group-a", x: 40, y: 140 }],
      edges: [{ id: "edge-a", source: "group-a", target: "skill-node-a", kind: "public-membership" }],
    },
  };
  experience.structureDigest = createHash("sha256").update(`${JSON.stringify(experience.structure, null, 2)}\n`).digest("hex");
  const sameStructureNewStyleA = structuredClone(experience);
  sameStructureNewStyleA.roundId = "round-b";
  sameStructureNewStyleA.directionId = "direction-b";
  const sameStructureNewStyleB = structuredClone(experience);
  sameStructureNewStyleB.roundId = "round-b";
  sameStructureNewStyleB.directionId = "direction-c";
  assert.throws(
    () => assertStructuralRedesignV3([experience], [sameStructureNewStyleA, sameStructureNewStyleB]),
    /same graph structure|CSS-only/,
  );
});

test("natural feedback distinguishes restyle, adjust, and structural redesign", (t) => {
  assert.equal(classifyCustomizationFeedbackV3("颜色换暖一点，字体柔和一些").changeKind, "restyle");
  assert.equal(classifyCustomizationFeedbackV3("不要重做，只改颜色").changeKind, "restyle");
  assert.equal(classifyCustomizationFeedbackV3("不用重新设计，只调字体").changeKind, "restyle");
  assert.equal(classifyCustomizationFeedbackV3("卡片间距再松一点").changeKind, "adjust");
  for (const feedback of ["重做地图", "节点太挤", "连线没意义", "想换一种组织方式"]) {
    assert.equal(classifyCustomizationFeedbackV3(feedback).changeKind, "redesign", feedback);
  }

  const parent = temporaryRoot("natural-feedback");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const prepared = prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest("library-first") });
  const target = prepared.directions[0];
  const beforeExperience = JSON.parse(fs.readFileSync(path.join(root, ...target.previewDirectory.split("/"), "customization-experience.v3.json"), "utf8"));
  const restyled = respondSkillCosmosCustomizationV3({
    projectDirectory: root,
    request: {
      schemaVersion: 3,
      generatedAt: "2026-08-02T15:00:00.000Z",
      text: "颜色换暖一点，字体柔和一些",
      directionId: target.id,
    },
  });
  assert.equal(restyled.changeKind, "restyle");
  const restyledExperience = JSON.parse(fs.readFileSync(path.join(root, ...restyled.previewDirectory.split("/"), "customization-experience.v3.json"), "utf8"));
  assert.deepEqual(restyledExperience.structure, beforeExperience.structure, "restyle must retain the graph");
  assert.equal(restyledExperience.structureDigest, beforeExperience.structureDigest, "restyle must retain the graph");

  const redesigned = respondSkillCosmosCustomizationV3({
    projectDirectory: root,
    request: {
      schemaVersion: 3,
      generatedAt: "2026-08-02T15:10:00.000Z",
      text: "节点太挤，连线也没意义，请重做地图",
    },
  });
  assert.equal(redesigned.changeKind, "redesign");
  const state = JSON.parse(fs.readFileSync(path.join(root, skillCosmosCustomizationFiles.state), "utf8"));
  assert.equal(state.rounds.length, 2);
  assert.equal(state.rounds[0].status, "closed");
  assert.deepEqual(state.rounds[1].inheritedFeedback, ["重做地图组织：重新生成分组、节点、连线和布局。"]);
  assert.equal(state.rounds[1].directions.length, 2);
  assert.ok(state.rounds[1].directions.every((direction) => direction.motion === "still"));
});

test("structural generation is deterministic and does not use round or direction ids as topology entropy", (t) => {
  const parent = temporaryRoot("deterministic-structure");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const siteData = JSON.parse(fs.readFileSync(path.join(root, "dist", "site-data.json"), "utf8"));
  const firstDirection = {
    ...directions()[0],
    revision: 1,
    parentDirectionId: null,
    status: "candidate",
    createdAt: "2026-08-02T15:00:00.000Z",
  };
  const renamedDirection = { ...firstDirection, id: "unrelated-id" };
  const first = createCustomizationExperienceV3({
    siteData,
    profile: profile(),
    roundId: "unrelated-round-a",
    direction: firstDirection,
    inheritedFeedback: ["节点太挤"],
    structuralGeneration: 2,
  });
  const second = createCustomizationExperienceV3({
    siteData,
    profile: profile(),
    roundId: "unrelated-round-b",
    direction: renamedDirection,
    inheritedFeedback: ["节点太挤"],
    structuralGeneration: 2,
  });
  assert.deepEqual(second.structure, first.structure);
  assert.equal(second.structureDigest, first.structureDigest);
});

test("a no-op refresh preserves a kept restyle structure byte-for-byte", (t) => {
  const parent = temporaryRoot("restyle-refresh");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const { root } = createProject(parent);
  const prepared = prepareSkillCosmosCustomizationV2({ projectDirectory: root, request: prepareRequest() });
  const restyled = respondSkillCosmosCustomizationV3({
    projectDirectory: root,
    request: {
      schemaVersion: 3,
      generatedAt: "2026-08-02T15:00:00.000Z",
      text: "只把颜色换暖一点",
      directionId: prepared.directions[0].id,
    },
  });
  decideSkillCosmosCustomizationV2({
    projectDirectory: root,
    request: {
      schemaVersion: 2,
      generatedAt: "2026-08-02T15:01:00.000Z",
      action: "keep",
      directionId: restyled.directionId,
      feedback: ["保留这个细节版本。"],
    },
  });
  const experiencePath = path.join(root, "customization", "current", "customization-experience.v3.json");
  const before = fs.readFileSync(experiencePath);
  const refreshed = refreshSkillCosmosCustomizationV2({
    projectDirectory: root,
    generatedAt: "2026-08-02T15:02:00.000Z",
  });
  assert.equal(refreshed.structureRefreshed, false);
  assert.deepEqual(fs.readFileSync(experiencePath), before);
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
  const excluded = new Set(["site-data.json", "frontend-handoff.v2.json", "custom-frontend.manifest.json", "customization-experience.v3.json"]);
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
  assert.equal(refreshed.structureRefreshed, true);
  assert.notEqual(refreshed.structureBefore, refreshed.structureAfter);
  assert.deepEqual(fileDigests(current, excluded), before);
  const siteData = JSON.parse(fs.readFileSync(path.join(current, "site-data.json"), "utf8"));
  assert.equal(siteData.appData.skills.length, 4);
  const experience = JSON.parse(fs.readFileSync(path.join(current, "customization-experience.v3.json"), "utf8"));
  assert.ok(experience.structure.nodes.some((node) => node.skillName === "browser-research"));
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
