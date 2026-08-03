import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requiredTasks = [
  "preflight", "consentGate", "install", "sourceSelection", "init", "importOrConfigure", "scan", "analyze", "diff", "generate", "doctor",
  "interview", "interviewBackEdit", "compareTwoDirections", "preferredView", "runtimeSwitch", "adjustOrReject", "keep", "refreshRecovery",
  "failureRecovery", "redoTopology", "readability", "keyboard", "bilingual", "privacyBoundary",
];
const statuses = new Set(["PASS", "FAIL", "NOT_TESTED", "BLOCKED"]);
const exactRelease = /^v([0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+)$/u;
const exactAsset = /^silent-orbit-skills-library-([0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+)\.tgz$/u;

function option(name) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function fail(message) { throw new Error(`Invalid novice human report: ${message}`); }
function extract(text) {
  const match = text.match(/<!--\s*SILENT_ORBIT_NOVICE_REPORT_JSON\s*\n([\s\S]*?)\nEND_SILENT_ORBIT_NOVICE_REPORT_JSON\s*-->/u);
  if (!match) fail("machine-readable report block is missing");
  try { return JSON.parse(match[1]); } catch { fail("machine-readable report block is not valid JSON"); }
}
function assertText(value, label, max = 400) { if (typeof value !== "string" || value.length < 1 || value.length > max) fail(`${label} is invalid`); }
function assertExactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} field inventory mismatch`);
}
function assertEnum(value, allowed, label) { if (!allowed.includes(value)) fail(`${label} is invalid`); }
function assertIsoTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) fail(`${label} is invalid`);
  const parsed = Date.parse(value);
  const normalized = value.endsWith(".000Z") || /\.\d{3}Z$/u.test(value) ? value : value.replace(/Z$/u, ".000Z");
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== normalized) fail(`${label} is invalid`);
}
function stringValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

export function validateNoviceHumanReport(text, expected = {}) {
  const ghPrefix = ["g", "h"].join("");
  const githubPatPrefix = ["github", "pat"].join("_");
  const openAiPrefix = ["s", "k"].join("");
  const forbidden = [
    /\b[A-Za-z]:[\\/][^\s"'<>|]*/i,
    /(?:^|[\s"'(])\/(?:[^/\s"'<>]+\/)+[^/\s"'<>]+/im,
    /\\\\[^\\\s"'<>|]+\\[^\\\s"'<>|]+/i,
    new RegExp(`\\b${ghPrefix}(?:p|o|u|s|r)_[A-Za-z0-9_]{8,}\\b`, "i"),
    new RegExp(`\\b${githubPatPrefix}_[A-Za-z0-9_]{8,}\\b`, "i"),
    new RegExp(`\\b${openAiPrefix}-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{8,}\\b`, "i"),
    /(?:cookie|password|access[_-]?token)\s*[:=]\s*\S+/i,
    /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/,
  ];
  const report = extract(text);
  const privacySurface = `${text}\n${stringValues(report).join("\n")}`;
  if (forbidden.some((pattern) => pattern.test(privacySurface))) fail("privacy or secret pattern detected");
  const allowedKeys = ["schemaVersion", "kind", "packVersion", "release", "releaseAsset", "releaseAssetSha256", "testedAt", "testerId", "independent", "environment", "tasks", "issues", "humanSummary", "verdict", "contactAllowed", "evidence"].sort();
  assertExactKeys(report, allowedKeys, "top-level");
  if (report.schemaVersion !== 1 || report.kind !== "SilentOrbitNoviceHumanTestReport" || report.packVersion !== "1.0.0") fail("schema identity mismatch");
  const releaseMatch = typeof report.release === "string" ? report.release.match(exactRelease) : null;
  const assetMatch = typeof report.releaseAsset === "string" ? report.releaseAsset.match(exactAsset) : null;
  if (!releaseMatch) fail("release is invalid");
  if (!assetMatch || assetMatch[1] !== releaseMatch[1]) fail("release asset is invalid or does not match release");
  if (expected.release && report.release !== expected.release) fail("release binding mismatch");
  if (expected.asset && report.releaseAsset !== expected.asset) fail("asset binding mismatch");
  if (expected.sha256 && report.releaseAssetSha256 !== expected.sha256) fail("SHA256 binding mismatch");
  if (!/^[0-9a-f]{64}$/.test(report.releaseAssetSha256 ?? "")) fail("release asset SHA256 is invalid");
  if (!/^tester-[a-z0-9-]{6,40}$/.test(report.testerId ?? "")) fail("anonymous tester id is invalid");
  assertIsoTimestamp(report.testedAt, "testedAt");
  if (typeof report.independent !== "boolean") fail("independent must be boolean");
  if (expected.requireIndependent && report.independent !== true) fail("independent gate requires an independent human");
  assertExactKeys(report.environment, ["agentFiles", "agentNetwork", "agentTerminal", "arch", "browser", "cpu", "desktop", "disk", "git", "mobile390", "network", "node", "npm", "os", "shell", "targetPermission"], "environment");
  assertEnum(report.environment.os, ["Windows", "macOS", "Linux"], "environment os");
  assertEnum(report.environment.arch, ["x64", "arm64", "other"], "environment arch");
  assertText(report.environment.shell, "environment shell", 80);
  assertText(report.environment.cpu, "environment cpu", 80);
  assertText(report.environment.git, "environment git", 80);
  assertText(report.environment.npm, "environment npm", 80);
  assertText(report.environment.browser, "environment browser", 80);
  if (report.environment.node !== "NOT_AVAILABLE" && !/^v24\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(report.environment.node ?? "")) fail("environment node is invalid");
  for (const field of ["network", "disk", "targetPermission", "agentTerminal", "agentFiles", "agentNetwork"]) assertEnum(report.environment[field], ["PASS", "BLOCKED", "NOT_TESTED"], `environment ${field}`);
  assertEnum(report.environment.desktop, ["PASS", "FAIL", "NOT_TESTED"], "environment desktop");
  assertEnum(report.environment.mobile390, ["PASS", "FAIL", "NOT_TESTED"], "environment mobile390");
  assertExactKeys(report.tasks, requiredTasks, "required task");
  for (const task of requiredTasks) {
    const result = report.tasks[task];
    assertExactKeys(result, ["status", "minutes", "note"], `task ${task}`);
    if (!statuses.has(result.status) || !Number.isInteger(result.minutes) || result.minutes < 0 || result.minutes > 600 || typeof result.note !== "string" || result.note.length > 400) fail(`task ${task} is invalid`);
  }
  if (!Array.isArray(report.issues)) fail("issues must be an array");
  for (const issue of report.issues) {
    assertExactKeys(issue, ["category", "severity", "summary"], "issue");
    if (!["productIssue", "executorIssue", "environmentBlocked"].includes(issue?.category) || !["P0", "P1", "P2"].includes(issue?.severity)) fail("issue classification is invalid");
    assertText(issue.summary, "issue summary");
  }
  assertText(report.humanSummary, "human summary", 1200);
  if (!["PASS", "FAIL", "INCOMPLETE"].includes(report.verdict)) fail("verdict is invalid");
  if (report.verdict === "PASS" && requiredTasks.some((task) => report.tasks[task].status !== "PASS")) fail("PASS cannot omit a required task");
  if (report.verdict === "PASS" && !/^v24\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(report.environment.node ?? "")) fail("PASS requires Node 24");
  if (report.verdict === "PASS" && ["network", "disk", "targetPermission", "agentTerminal", "agentFiles", "agentNetwork"].some((field) => report.environment[field] !== "PASS")) fail("PASS requires all environment capabilities");
  if (report.verdict === "PASS" && (report.environment.desktop !== "PASS" || report.environment.mobile390 !== "PASS")) fail("PASS requires desktop and 390px human checks");
  if (report.verdict === "PASS" && report.issues.some((issue) => ["P0", "P1"].includes(issue.severity))) fail("PASS cannot include a P0 or P1 issue");
  if (report.independent !== true && report.verdict === "PASS" && expected.requireIndependent) fail("internal rehearsal cannot pass the independent gate");
  if (typeof report.contactAllowed !== "boolean" || !Array.isArray(report.evidence)) fail("contact/evidence fields are invalid");
  for (const item of report.evidence) {
    assertExactKeys(item, ["name", "sha256"], "evidence reference");
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(item.name) || !/^[0-9a-f]{64}$/.test(item.sha256)) fail("evidence reference is invalid");
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reportPath = option("--report");
  if (!reportPath) fail("--report is required");
  const expectedRelease = option("--expected-release");
  const expectedAsset = option("--expected-asset");
  const expectedSha256 = option("--expected-sha256");
  if (!expectedRelease || !expectedAsset || !expectedSha256) fail("--expected-release, --expected-asset, and --expected-sha256 are required");
  const report = validateNoviceHumanReport(fs.readFileSync(path.resolve(reportPath), "utf8"), {
    release: expectedRelease, asset: expectedAsset, sha256: expectedSha256, requireIndependent: process.argv.includes("--require-independent"),
  });
  process.stdout.write(`${JSON.stringify({ status: "pass", release: report.release, testerId: report.testerId, independent: report.independent, verdict: report.verdict })}\n`);
}
