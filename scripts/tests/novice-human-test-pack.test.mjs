import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateNoviceHumanReport } from "../validate-novice-human-report.mjs";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const template = fs.readFileSync(path.join(root, "docs/public-release/SILENT_ORBIT_NOVICE_HUMAN_TEST_PACK.zh-CN.template.md"), "utf8");
const sha = "a".repeat(64);
const tasks = Object.fromEntries([
  "preflight", "consentGate", "install", "sourceSelection", "init", "importOrConfigure", "scan", "analyze", "diff", "generate", "doctor",
  "interview", "interviewBackEdit", "compareTwoDirections", "preferredView", "runtimeSwitch", "adjustOrReject", "keep", "refreshRecovery",
  "failureRecovery", "redoTopology", "readability", "keyboard", "bilingual", "privacyBoundary",
].map((name) => [name, { status: "PASS", minutes: 1, note: "ok" }]));
const environment = {
  os: "Windows", arch: "x64", cpu: "x64 desktop CPU", shell: "PowerShell", node: "v24.14.0", npm: "11.6.2", git: "2.50.0", browser: "Chromium",
  network: "PASS", disk: "PASS", targetPermission: "PASS", agentTerminal: "PASS", agentFiles: "PASS", agentNetwork: "PASS", desktop: "PASS", mobile390: "PASS",
};
function report(overrides = {}) { return `<!-- SILENT_ORBIT_NOVICE_REPORT_JSON\n${JSON.stringify({ schemaVersion: 1, kind: "SilentOrbitNoviceHumanTestReport", packVersion: "1.0.0", release: "v0.13.0-beta.1", releaseAsset: "silent-orbit-skills-library-0.13.0-beta.1.tgz", releaseAssetSha256: sha, testedAt: "2026-08-03T12:00:00.000Z", testerId: "tester-abcdef", independent: true, environment, tasks, issues: [], humanSummary: "新手确认流程清楚，默认视图和重做地图均符合预期。", verdict: "PASS", contactAllowed: false, evidence: [], ...overrides }, null, 2)}\nEND_SILENT_ORBIT_NOVICE_REPORT_JSON -->`; }

test("single-file novice pack is plain-language, consent-gated, topology-aware, and privacy explicit", () => {
  const expectedTokens = new Map([
    ["{{PUBLIC_RELEASE_TAG}}", 3],
    ["{{PUBLIC_RELEASE_URL}}", 1],
    ["{{PUBLIC_TARBALL_FILE}}", 5],
    ["{{PUBLIC_TARBALL_URL}}", 1],
    ["{{PUBLIC_TARBALL_SHA256}}", 4],
  ]);
  for (const [token, count] of expectedTokens) assert.equal(template.split(token).length - 1, count, `${token} occurrence count`);
  assert.match(template, /一次只问一个|不确定\/跳过也可以/u);
  assert.match(template, /portable\/project-local Node 24/u);
  assert.match(template, /不得默认全局安装/u);
  assert.match(template, /init → import-or-configure → scan → analyze → diff → generate → doctor/u);
  assert.match(template, /节点位置、边集合、分组、布局策略/u);
  assert.match(template, /Customization Issue Form 等价回执/u);
  assert.doesNotMatch(template, /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]/iu);
  assert.doesNotMatch(template, /\/(?:Users|home)\/[^/\s]+/u);
  assert.doesNotMatch(template, /\\\\[^\\\s]+\\(?:Users|Documents and Settings)\\[^\\\s]+/u);
});

test("report validator binds exact release fields and rejects internal rehearsals, extra payloads, secrets, and private paths", (t) => {
  const expected = { release: "v0.13.0-beta.1", asset: "silent-orbit-skills-library-0.13.0-beta.1.tgz", sha256: sha, requireIndependent: true };
  const windowsUserPath = ["C:", "Users", "name", "secret"].join("\\");
  const lowercaseWindowsUserPath = ["c:", "users", "name", "secret"].join("\\");
  const windowsTempPath = ["D:", "temp", "evidence.txt"].join("\\");
  const unixHomePath = ["", "home", "name", "secret"].join("/");
  const unixTempPath = ["", "tmp", "evidence.txt"].join("/");
  const uncUserPath = `\\\\${["server", "Users", "name", "secret"].join("\\")}`;
  const uncSharePath = `\\\\${["server", "share", "evidence.txt"].join("\\")}`;
  assert.equal(validateNoviceHumanReport(report(), expected).verdict, "PASS");
  assert.throws(() => validateNoviceHumanReport(report({ independent: false }), expected), /independent gate/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${windowsUserPath}`, expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${lowercaseWindowsUserPath}`, expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${windowsTempPath}`, expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${unixHomePath}`, expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${unixTempPath}`, expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${uncUserPath}`, expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(`${report()}\n${uncSharePath}`, expected), /privacy/u);
  assert.doesNotThrow(() => validateNoviceHumanReport(`${report()}\n分类：productIssue/executorIssue/environmentBlocked`, expected));
  assert.doesNotThrow(() => validateNoviceHumanReport(`${report()}\nRelease: https://example.invalid/release/asset`, expected));
  assert.throws(() => validateNoviceHumanReport(report({ humanSummary: `发现路径 ${windowsUserPath}` }), expected), /privacy/u);
  assert.throws(() => validateNoviceHumanReport(report({ release: "v0.12.0-beta.1" }), expected), /release asset|release binding/u);
  assert.throws(() => validateNoviceHumanReport(report({ releaseAsset: "silent-orbit-skills-library-0.13.0-beta.2.tgz" }), expected), /release asset|asset binding/u);
  assert.throws(() => validateNoviceHumanReport(report({ releaseAssetSha256: "b".repeat(64) }), expected), /SHA256 binding/u);
  assert.throws(() => validateNoviceHumanReport(report({ release: null })), /release is invalid/u);
  assert.throws(() => validateNoviceHumanReport(report({ tasks: { ...tasks, scan: { status: "FAIL", minutes: 1, note: "failed" } } }), expected), /required task/u);
  assert.throws(() => validateNoviceHumanReport(report({ tasks: { ...tasks, scan: { ...tasks.scan, rawTranscript: "private" } } }), expected), /field inventory/u);
  assert.throws(() => validateNoviceHumanReport(report({ environment: { ...environment, node: "v24.fake" } }), expected), /environment node/u);
  assert.throws(() => validateNoviceHumanReport(report({ environment: { ...environment, node: "NOT_AVAILABLE" } }), expected), /PASS requires Node 24/u);
  assert.equal(validateNoviceHumanReport(report({ environment: { ...environment, node: "NOT_AVAILABLE" }, tasks: { ...tasks, install: { status: "BLOCKED", minutes: 1, note: "Node unavailable" } }, verdict: "INCOMPLETE" }), expected).verdict, "INCOMPLETE");
  assert.throws(() => validateNoviceHumanReport(report({ testedAt: "2026-02-31T12:00:00Z" }), expected), /testedAt/u);
  for (const severity of ["P0", "P1"]) {
    assert.throws(() => validateNoviceHumanReport(report({ issues: [{ category: "productIssue", severity, summary: "阻断问题" }] }), expected), /P0 or P1/u);
  }

  const secretFixtures = [
    `${["g", "hp"].join("")}_${"a".repeat(20)}`,
    `${["g", "hu"].join("")}_${"b".repeat(20)}`,
    `${["g", "hs"].join("")}_${"c".repeat(20)}`,
    `${["g", "hr"].join("")}_${"d".repeat(20)}`,
    `${["github", "pat"].join("_")}_${"e".repeat(20)}`,
    `${["s", "k"].join("")}-${"f".repeat(20)}`,
    `${["s", "k"].join("")}-svcacct-${"g".repeat(20)}`,
  ];
  for (const secret of secretFixtures) assert.throws(() => validateNoviceHumanReport(`${report()}\n${secret}`, expected), /privacy/u);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-report-validator-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const reportPath = path.join(temp, "report.md");
  fs.writeFileSync(reportPath, report(), "utf8");
  const cli = spawnSync(process.execPath, [path.join(root, "scripts", "validate-novice-human-report.mjs"), "--report", reportPath], { encoding: "utf8", windowsHide: true });
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /expected-release.*expected-asset.*expected-sha256/u);
  const validCli = spawnSync(process.execPath, [
    path.join(root, "scripts", "validate-novice-human-report.mjs"),
    "--report", reportPath,
    "--expected-release", expected.release,
    "--expected-asset", expected.asset,
    "--expected-sha256", expected.sha256,
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(validCli.status, 0, validCli.stderr);
});
