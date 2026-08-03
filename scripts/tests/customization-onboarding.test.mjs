import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  answerCustomizationInterviewV3,
  backCustomizationInterviewV3,
  confirmCustomizationInterviewV3,
  createCustomizationDirectionSpecsV2,
  createCustomizationInterviewV3,
  customizationOnboardingFiles,
  persistCustomizationInterviewConfirmationV3,
  persistCustomizationInterviewV3,
  preflightCustomizationOnboardingV3,
  reviewCustomizationInterviewV3,
  setupCustomizationOnboardingV3,
} from "../lib/customization-onboarding.mjs";
import { createFrontendHandoffV2 } from "../lib/generator-contracts.mjs";
import { createDefaultSilentOrbitConfigV1 } from "../lib/silent-orbit-project.mjs";
import { validateDesignProfileV2 } from "../lib/skill-cosmos-customization.mjs";

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../silent-orbit.mjs");

function runCliProcess(args) {
  const child = spawnSync(process.execPath, [cliPath, ...args, "--json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout);
}

function temporaryRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-onboarding-${label}-`));
}

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createGeneratedProject(parent, projectName = "project") {
  const root = path.join(parent, projectName);
  fs.mkdirSync(root, { recursive: true });
  const config = createDefaultSilentOrbitConfigV1({ projectId: `${projectName}-id`, title: "新手项目" });
  writeJson(path.join(root, "silent-orbit.config.json"), config);
  const siteManifest = {
    schemaVersion: 1,
    projectId: config.project.projectId,
    generatedAt: "2026-08-02T12:00:00.000Z",
    snapshotRefs: { inventory: "inventory-fixture", library: "library-fixture" },
    renderer: { ...config.project.renderer },
    locales: [...config.project.locales],
    summary: { skills: 1, libraries: 1, categories: 1, collections: 0 },
    privacy: { includesLocalOnly: false, publicVisibilities: ["public", "creator-showcase"] },
  };
  const siteData = {
    project: config.project,
    siteManifest,
    appData: {
      skills: [{ id: "skill:fixture", name: "新手工具", visibility: "public" }],
      libraries: [],
      categoryUnits: [],
      categorySkillNames: {},
    },
  };
  const handoff = createFrontendHandoffV2({ projectConfig: config.project, siteManifest });
  writeJson(path.join(root, "dist", "site-data.json"), siteData);
  writeJson(path.join(root, "dist", "frontend-handoff.v2.json"), handoff);
  return root;
}

function snapshotFiles(root) {
  const result = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target).split(path.sep).join("/");
      if (entry.isSymbolicLink()) result.set(relative, `symlink:${fs.readlinkSync(target)}`);
      else if (entry.isDirectory()) {
        result.set(relative, "directory");
        visit(target);
      }
      else if (entry.isFile()) {
        result.set(relative, `file:${createHash("sha256").update(fs.readFileSync(target)).digest("hex")}`);
      }
    }
  };
  visit(root);
  return result;
}

test("preflight is read-only and explains exact project-only consent in plain Chinese", (t) => {
  const parent = temporaryRoot("preflight");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const project = createGeneratedProject(parent);
  const unrelated = path.join(parent, "outside-sentinel.txt");
  fs.writeFileSync(unrelated, "must stay untouched\n", "utf8");
  const before = snapshotFiles(parent);

  const preflight = preflightCustomizationOnboardingV3({ projectDirectory: project, nodeVersion: "v24.14.0" });

  assert.equal(preflight.status, "needs-consent");
  assert.equal(preflight.readOnly, true);
  assert.equal(preflight.canSetup, true);
  assert.ok(preflight.checks.find((entry) => entry.id === "node-24" && entry.state === "pass"));
  assert.ok(preflight.checks.find((entry) => entry.id === "project-config" && entry.state === "pass"));
  assert.ok(preflight.checks.find((entry) => entry.id === "generated-public-data" && entry.state === "pass"));
  assert.ok(preflight.checks.find((entry) => entry.id === "bundled-preview" && entry.state === "pass"));
  assert.ok(preflight.checks.find((entry) => entry.id === "agent-path" && entry.state === "pass"));
  assert.ok(preflight.checks.find((entry) => entry.id === "browser-path" && entry.state === "pass"));
  assert.deepEqual(preflight.explanation.willWrite, [customizationOnboardingFiles.onboarding]);
  assert.ok(preflight.explanation.willNotWrite.some((entry) => entry.includes("全局")));
  assert.match(preflight.confirmation.token, /^confirm-project-onboarding:project-id:[a-f0-9]{16}$/u);
  assert.match(JSON.stringify(preflight.explanation), /已有|缺少|不会|项目/u);
  assert.deepEqual(snapshotFiles(parent), before, "preflight must not create or edit anything");

  const wrongNode = preflightCustomizationOnboardingV3({ projectDirectory: project, nodeVersion: "22.18.0" });
  assert.equal(wrongNode.checks.find((entry) => entry.id === "node-24").state, "missing");
  assert.equal(wrongNode.status, "blocked");
  assert.equal(wrongNode.canSetup, false, "project setup cannot pretend to repair a missing runtime");
  assert.equal(wrongNode.confirmation.required, false, "blocked prerequisites must be explained before asking for consent");
  assert.equal(wrongNode.confirmation.token, null);
  assert.deepEqual(snapshotFiles(parent), before, "failed checks must also remain read-only");
});

test("setup requires the exact token and writes only the project onboarding sidecar", (t) => {
  const parent = temporaryRoot("setup");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const project = createGeneratedProject(parent);
  const outside = path.join(parent, "outside-sentinel.txt");
  fs.writeFileSync(outside, "outside\n", "utf8");
  const initial = snapshotFiles(parent);
  const preflight = preflightCustomizationOnboardingV3({ projectDirectory: project, nodeVersion: "24.14.0" });

  const denied = setupCustomizationOnboardingV3({
    projectDirectory: project,
    confirmationToken: `${preflight.confirmation.token}-not-exact`,
    configuredAt: "2026-08-02T13:00:00.000Z",
    nodeVersion: "24.14.0",
  });
  assert.equal(denied.status, "consent-required");
  assert.equal(denied.wrote, false);
  assert.deepEqual(snapshotFiles(parent), initial, "wrong consent must not even create a directory");

  const accepted = setupCustomizationOnboardingV3({
    projectDirectory: project,
    confirmationToken: preflight.confirmation.token,
    configuredAt: "2026-08-02T13:00:00.000Z",
    nodeVersion: "24.14.0",
  });
  assert.equal(accepted.wrote, true);
  assert.equal(accepted.status, "ready");
  assert.equal(accepted.preflight.confirmation.required, false);

  const after = snapshotFiles(parent);
  const added = [...after.keys()].filter((relative) => !initial.has(relative));
  assert.deepEqual(added, [
    "project/.silent-orbit",
    "project/.silent-orbit/customization",
    `project/${customizationOnboardingFiles.onboarding}`,
  ]);
  for (const [relative, digest] of initial) assert.equal(after.get(relative), digest, relative);
  const saved = JSON.parse(fs.readFileSync(path.join(project, ...customizationOnboardingFiles.onboarding.split("/")), "utf8"));
  assert.equal(saved.kind, "CustomizationOnboardingV3");
  assert.equal(saved.scope, "project-only");
  assert.deepEqual(saved.permissions, { globalInstall: false, systemConfiguration: false, outsideProjectWrites: false });
  assert.equal(fs.readFileSync(outside, "utf8"), "outside\n");
});

test("malformed onboarding fails closed and direct persistence cannot bypass consent", (t) => {
  const parent = temporaryRoot("invalid-sidecar");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const project = createGeneratedProject(parent);
  const state = createCustomizationInterviewV3({ profileId: "consent-boundary", createdAt: "2026-08-02T13:30:00.000Z" }).state;
  const before = snapshotFiles(parent);
  assert.throws(() => persistCustomizationInterviewV3({ projectDirectory: project, state }), /onboarding must be present/u);
  assert.deepEqual(snapshotFiles(parent), before, "rejected direct persistence must not create directories");

  const onboardingPath = path.join(project, ...customizationOnboardingFiles.onboarding.split("/"));
  fs.mkdirSync(path.dirname(onboardingPath), { recursive: true });
  fs.writeFileSync(onboardingPath, "{not-json\n", "utf8");
  const malformedBytes = fs.readFileSync(onboardingPath);
  const preflight = preflightCustomizationOnboardingV3({ projectDirectory: project, nodeVersion: "v24.14.0" });
  assert.equal(preflight.status, "blocked");
  assert.equal(preflight.canSetup, false);
  assert.equal(preflight.confirmation.required, false);
  const setup = setupCustomizationOnboardingV3({ projectDirectory: project, confirmationToken: "anything", nodeVersion: "v24.14.0" });
  assert.equal(setup.status, "blocked");
  assert.equal(setup.wrote, false);
  assert.deepEqual(fs.readFileSync(onboardingPath), malformedBytes, "invalid existing sidecar must not be overwritten");
});

test("persisted interview and confirmation reject extra transcript-bearing fields", (t) => {
  const parent = temporaryRoot("strict-persistence");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const project = createGeneratedProject(parent);
  const preflight = preflightCustomizationOnboardingV3({ projectDirectory: project, nodeVersion: "v24.14.0" });
  setupCustomizationOnboardingV3({ projectDirectory: project, confirmationToken: preflight.confirmation.token, configuredAt: "2026-08-02T13:40:00.000Z", nodeVersion: "v24.14.0" });

  let result = createCustomizationInterviewV3({ profileId: "strict-state", createdAt: "2026-08-02T13:41:00.000Z" });
  result = answerCustomizationInterviewV3(result.state, "像安静的书。", { answeredAt: "2026-08-02T13:42:00.000Z" });
  const taintedState = structuredClone(result.state);
  taintedState.answers["familiar-places"].rawTranscript = "逐字内容";
  assert.throws(() => persistCustomizationInterviewV3({ projectDirectory: project, state: taintedState }), /field inventory/u);
  assert.equal(fs.existsSync(path.join(project, ...customizationOnboardingFiles.interview.split("/"))), false, "rejected transcript-bearing state must not be written");
  persistCustomizationInterviewV3({ projectDirectory: project, state: result.state });

  const answers = ["跳过", "跳过", "先看目录", "颜色柔和", "少一点动画"];
  for (let index = 0; index < answers.length; index += 1) {
    result = answerCustomizationInterviewV3(result.state, answers[index], { answeredAt: `2026-08-02T13:${43 + index}:00.000Z` });
  }
  const confirmation = confirmCustomizationInterviewV3(result.state, { confirmedAt: "2026-08-02T13:50:00.000Z" });
  const taintedConfirmation = structuredClone(confirmation);
  taintedConfirmation.inferences[0].rawAnswer = "逐字内容";
  assert.throws(() => persistCustomizationInterviewConfirmationV3({ projectDirectory: project, confirmation: taintedConfirmation }), /field inventory/u);
  assert.equal(fs.existsSync(path.join(project, ...customizationOnboardingFiles.confirmation.split("/"))), false, "rejected transcript-bearing confirmation must not be written");
  assert.equal(persistCustomizationInterviewConfirmationV3({ projectDirectory: project, confirmation }).kind, "CustomizationInterviewConfirmationV3");
});

test("Chinese beginner interview asks one life-like question at a time and never stores verbatim answers", () => {
  const started = createCustomizationInterviewV3({ profileId: "new-user", createdAt: "2026-08-02T14:00:00.000Z" });
  assert.equal(started.status, "question");
  assert.equal(started.question.progress, "1/6");
  assert.ok(started.question.examples.length >= 2 && started.question.examples.length <= 3);
  assert.match(started.question.escape, /不知道|不确定|跳过/u);
  assert.equal(Object.hasOwn(started, "questions"), false);

  const rawReference = "我喜欢 Apple 官网那种大片留白，也喜欢可以慢慢逛的宇宙星图。";
  let result = answerCustomizationInterviewV3(started.state, rawReference, { answeredAt: "2026-08-02T14:01:00.000Z" });
  assert.equal(result.question.progress, "2/6");
  const rawAvoid = "我不知道，这题先跳过。";
  result = answerCustomizationInterviewV3(result.state, rawAvoid, { answeredAt: "2026-08-02T14:02:00.000Z" });
  assert.equal(result.state.answers.avoid.status, "skipped");
  const rawFeeling = "大概就是舒服一点吧，还没想好。";
  result = answerCustomizationInterviewV3(result.state, rawFeeling, { answeredAt: "2026-08-02T14:03:00.000Z" });
  assert.equal(result.state.answers.feeling.status, "uncertain");

  const firstNavigation = "我想先看地图，顺着关系到处逛；页面不要太挤。";
  result = answerCustomizationInterviewV3(result.state, firstNavigation, { answeredAt: "2026-08-02T14:04:00.000Z" });
  assert.equal(result.state.answers["find-things"].values.navigation, "map-first");
  assert.equal(result.question.progress, "5/6");

  result = backCustomizationInterviewV3(result.state, { changedAt: "2026-08-02T14:04:30.000Z" });
  assert.equal(result.question.progress, "4/6");
  const revisedNavigation = "改一下：我平时知道要找什么，所以首次打开请先给我目录列表。";
  result = answerCustomizationInterviewV3(result.state, revisedNavigation, { answeredAt: "2026-08-02T14:05:00.000Z" });
  assert.equal(result.state.answers["find-things"].values.navigation, "library-first");
  const rawReading = "颜色和字我都不确定，先用舒服的就行。";
  result = answerCustomizationInterviewV3(result.state, rawReading, { answeredAt: "2026-08-02T14:06:00.000Z" });
  assert.equal(result.state.answers["reading-surface"].status, "uncertain");
  const rawComfort = "动画越少越好，我容易分心；而且我大多数时候用手机。";
  result = answerCustomizationInterviewV3(result.state, rawComfort, { answeredAt: "2026-08-02T14:07:00.000Z" });
  assert.equal(result.status, "review");

  const serializedState = JSON.stringify(result.state);
  for (const raw of [rawReference, rawAvoid, rawFeeling, firstNavigation, revisedNavigation, rawReading, rawComfort]) assert.equal(serializedState.includes(raw), false);
  assert.doesNotMatch(serializedState, /rawInterview|rawAnswer|transcript|verbatim/u);
  assert.equal(Object.hasOwn(result.review, "advanced"), false, "professional fields stay progressively disclosed");
  assert.match(result.review.title, /我理解的是/u);
  assert.ok(result.review.summary.some((entry) => entry.includes("首次打开先到目录")));

  const advanced = reviewCustomizationInterviewV3(result.state, { advanced: true });
  assert.equal(advanced.advanced.preferences.navigation, "library-first");
  assert.equal(advanced.advanced.preferences.motion, "still");
  assert.equal(advanced.advanced.preferences.accessibility.mobilePriority, "essential");

  const confirmed = confirmCustomizationInterviewV3(result.state, { confirmedAt: "2026-08-02T14:08:00.000Z" });
  assert.equal(validateDesignProfileV2(confirmed.profile), confirmed.profile);
  assert.equal(confirmed.profile.preferences.navigation, "library-first");
  assert.equal(confirmed.profile.preferences.motion, "still");
  assert.equal(confirmed.profile.preferences.accessibility.reducedMotion, true);
  assert.equal(confirmed.profile.preferences.accessibility.mobilePriority, "essential");
  assert.equal(confirmed.inferences.length, 6);
  assert.ok(confirmed.inferences.every((entry) => entry.explanation.length > 0));

  const directions = createCustomizationDirectionSpecsV2(confirmed.profile);
  assert.equal(directions.length, 2);
  assert.notEqual(directions[0].id, directions[1].id);
  assert.ok(directions.every((direction) => direction.motion === "still"), "reduced-motion preference applies to both directions");
  const structuralKeys = ["layout", "density", "typography", "motion", "shape"];
  assert.ok(structuralKeys.filter((key) => directions[0][key] !== directions[1][key]).length >= 2);
});

test("Chinese novice normalization preserves an interactive newspaper reference and gives mobile negation precedence", () => {
  const answers = [
    "一本可互动的杂志，就像哈利波特里面的预言家日报一样",
    "我不知道",
    "利落、可靠，像一件好用的工具",
    "在一张关系图里逛，先看关系图，我喜欢顺着关联探索",
    "像清楚的工具界面，黑白分明，结合亲切、圆润一些，颜色柔和",
    "可以有一点自然反馈，但别一直动，外加我完全不用手机",
  ];
  let result = createCustomizationInterviewV3({ profileId: "matthew-retest", createdAt: "2026-08-03T12:00:00.000Z" });
  answers.forEach((answer, index) => {
    result = answerCustomizationInterviewV3(result.state, answer, { answeredAt: `2026-08-03T12:0${index + 1}:00.000Z` });
  });

  assert.equal(result.status, "review");
  assert.ok(result.review.summary.some((entry) => entry.includes("会动的报纸") && entry.includes("可互动")));
  assert.ok(result.review.summary.some((entry) => entry.includes("电脑端优先") && entry.includes("手机不是主要使用场景")));

  const advanced = reviewCustomizationInterviewV3(result.state, { advanced: true });
  assert.deepEqual(advanced.advanced.preferences.references, ["像会动的报纸一样可互动的书刊页面"]);
  assert.equal(advanced.advanced.preferences.motion, "measured");
  assert.equal(advanced.advanced.preferences.accessibility.mobilePriority, "desktop-led");
  assert.match(result.state.answers["familiar-places"].inference, /互动书刊|会动报纸/u);
  assert.match(result.state.answers.comfort.summary, /手机不是你的使用场景/u);

  const serializedState = JSON.stringify(result.state);
  for (const answer of answers) assert.equal(serializedState.includes(answer), false);
});

test("navigation normalization respects explicit priority and balanced wording", () => {
  function navigationFor(answer) {
    let result = createCustomizationInterviewV3({ profileId: "navigation-language", createdAt: "2026-08-02T15:30:00.000Z" });
    for (const [index, response] of ["跳过", "跳过", "跳过", answer].entries()) {
      result = answerCustomizationInterviewV3(result.state, response, { answeredAt: `2026-08-02T15:3${index + 1}:00.000Z` });
    }
    return result.state.answers["find-things"].values.navigation;
  }

  assert.equal(navigationFor("先看关系图，目录作为备用。"), "map-first");
  assert.equal(navigationFor("首次打开先给我目录，关系图以后再逛。"), "library-first");
  assert.equal(navigationFor("目录和关系图都可以，没有先后。"), "balanced");
  assert.equal(navigationFor("不要先看目录；默认先看关系图。"), "map-first");
  assert.equal(navigationFor("不要先看关系图；默认先看目录。"), "library-first");
});

test("normalization does not turn rejected references or accessibility settings into preferences", () => {
  let result = createCustomizationInterviewV3({ profileId: "negation-language", createdAt: "2026-08-02T15:35:00.000Z" });
  result = answerCustomizationInterviewV3(result.state, "我不喜欢苹果官网，想避开这种风格。", { answeredAt: "2026-08-02T15:35:10.000Z" });
  assert.doesNotMatch(result.state.answers["familiar-places"].values.references.join(" "), /产品介绍页/u);
  for (const [index, answer] of ["跳过", "跳过", "跳过", "我不需要高对比，颜色柔和就好。", "我不需要高对比，可以有一点自然反馈。"].entries()) {
    result = answerCustomizationInterviewV3(result.state, answer, { answeredAt: `2026-08-02T15:${36 + index}:00.000Z` });
  }
  const preferences = reviewCustomizationInterviewV3(result.state, { advanced: true }).advanced.preferences;
  assert.equal(preferences.accessibility.highContrast, false);
});

test("long profile ids preserve unique direction and generation suffixes", () => {
  let result = createCustomizationInterviewV3({ profileId: "a".repeat(72), createdAt: "2026-08-02T15:40:00.000Z" });
  for (let index = 0; index < 6; index += 1) {
    result = answerCustomizationInterviewV3(result.state, "跳过", { answeredAt: `2026-08-02T15:4${index + 1}:00.000Z` });
  }
  const profile = confirmCustomizationInterviewV3(result.state, { confirmedAt: "2026-08-02T15:50:00.000Z" }).profile;
  const first = createCustomizationDirectionSpecsV2(profile, { generation: 1 });
  const second = createCustomizationDirectionSpecsV2(profile, { generation: 2 });
  assert.equal(new Set([...first, ...second].map((direction) => direction.id)).size, 4);
  assert.ok(first.every((direction) => direction.id.length <= 72 && /-r1-g1$/u.test(direction.id)));
  assert.ok(second.every((direction) => direction.id.length <= 72 && /-r1-g2$/u.test(direction.id)));
});

test("CLI beginner rehearsal persists normalized progress and prepares two directions without professional fixtures", { skip: Number.parseInt(process.versions.node.split(".")[0], 10) !== 24 }, (t) => {
  const parent = temporaryRoot("cli-rehearsal");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const project = createGeneratedProject(parent);
  const preflight = runCliProcess(["customize", "preflight", "--project", project]);
  assert.equal(preflight.status, "needs-consent");
  const setup = runCliProcess([
    "customize", "setup", "--project", project,
    "--confirm", preflight.confirmation.token,
    "--generated-at", "2026-08-02T16:00:00.000Z",
  ]);
  assert.equal(setup.status, "ready");
  const started = runCliProcess(["customize", "interview", "start", "--project", project, "--generated-at", "2026-08-02T16:01:00.000Z"]);
  assert.equal(started.question.progress, "1/6");
  const answers = [
    "我喜欢可以慢慢逛的星图，也喜欢留白多的书。",
    "不要一屏塞满相同卡片。",
    "安静、清楚，像整理好的书房。",
    "我通常知道找什么，首次打开先给我目录，内容别太挤。",
    "像书刊一样耐读，颜色克制。",
    "动画越少越好，我大多数时候用手机。",
  ];
  answers.forEach((answer, index) => {
    const result = runCliProcess([
      "customize", "interview", "answer", "--project", project,
      "--answer", answer,
      "--generated-at", `2026-08-02T16:0${index + 2}:00.000Z`,
    ]);
    assert.equal(result.kind, "CustomizationInterviewStepV3");
    const persisted = JSON.parse(fs.readFileSync(path.join(project, ...customizationOnboardingFiles.interview.split("/")), "utf8"));
    assert.equal(persisted.cursor, index + 1, "each fresh CLI process must persist progress");
    assert.equal(Object.keys(persisted.answers).length, index + 1);
  });
  const review = runCliProcess(["customize", "interview", "review", "--project", project]);
  assert.equal(Object.hasOwn(review.review, "advanced"), false);
  const advanced = runCliProcess(["customize", "interview", "review", "--project", project, "--advanced"]);
  assert.equal(advanced.review.advanced.preferences.navigation, "library-first");
  const confirmed = runCliProcess(["customize", "interview", "confirm", "--project", project, "--generated-at", "2026-08-02T16:10:00.000Z"]);
  assert.equal(confirmed.profile.preferences.navigation, "library-first");
  const prepared = runCliProcess(["customize", "prepare", "--from-interview", "--project", project, "--generated-at", "2026-08-02T16:11:00.000Z"]);
  assert.equal(prepared.directions.length, 2);
  assert.ok(prepared.directions.every((direction) => direction.preferredView === "library"));
  const backed = runCliProcess(["customize", "interview", "back", "--project", project, "--generated-at", "2026-08-02T16:12:00.000Z"]);
  assert.equal(backed.question.progress, "6/6");
  assert.equal(fs.existsSync(path.join(project, ...customizationOnboardingFiles.confirmation.split("/"))), false, "editing interview progress invalidates the old confirmation");
  const stalePrepare = spawnSync(process.execPath, [cliPath, "customize", "prepare", "--from-interview", "--project", project, "--json"], { encoding: "utf8", windowsHide: true });
  assert.notEqual(stalePrepare.status, 0);
  assert.match(stalePrepare.stderr, /confirmation|confirmed novice interview|confirm/i);
  const storedInterview = fs.readFileSync(path.join(project, ...customizationOnboardingFiles.interview.split("/")), "utf8");
  for (const answer of answers) assert.equal(storedInterview.includes(answer), false);
});
