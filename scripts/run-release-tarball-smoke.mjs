import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertLocalMarkdownLinks } from "./lib/markdown-links.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixturePath = path.join(projectDir, "scripts", "fixtures", "v1-preflight", "starter.source-import.json");
const generatedAt = "2026-07-26T00:00:00.000Z";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function npmInvocation(args) {
  const npmCli = process.env.npm_execpath;
  if (npmCli && fs.existsSync(npmCli)) return [process.execPath, [npmCli, ...args]];
  return [process.platform === "win32" ? "npm.cmd" : "npm", args];
}

function run(command, args, { cwd, json = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: {
      ...process.env,
      NO_COLOR: "1",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args[0] ?? ""} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  if (!json) return result.stdout.trim();
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${path.basename(command)} ${args[0] ?? ""} did not return JSON.`);
  }
}

function runNpm(args, options = {}) {
  const [command, expandedArgs] = npmInvocation(args);
  if (process.platform === "win32" && /\.cmd$/i.test(command)) {
    return runWindowsShim(command, expandedArgs, options);
  }
  return run(command, expandedArgs, options);
}

function runWindowsShim(command, args, options) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  return run("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `& ${quote(command)} ${args.map(quote).join(" ")}`,
  ], options);
}

function walkFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function isText(bytes) {
  if (bytes.includes(0)) return false;
  return bytes.length === 0 || bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8").includes("\uFFFD") === false;
}

function assertNoPrivatePaths(roots) {
  const exactCandidates = [
    os.homedir(),
    process.env.USERPROFILE,
    process.env.CODEX_HOME,
    process.env.HOME,
    projectDir,
    ["C:", "Users", "Matthew"].join("\\"),
    ["C:", "Users", "Matthew"].join("/"),
  ].filter(Boolean);
  const forbidden = [...new Set(exactCandidates.flatMap((value) => [
    value,
    value.replaceAll("\\", "/"),
    value.replaceAll("/", "\\"),
  ]))].filter((value) => value.length >= 8);

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const filePath of walkFiles(root)) {
      const bytes = fs.readFileSync(filePath);
      if (!isText(bytes)) continue;
      const content = bytes.toString("utf8");
      const match = forbidden.find((value) => content.includes(value));
      if (match) throw new Error(`Private absolute path detected in ${path.relative(root, filePath) || path.basename(filePath)}.`);
    }
  }
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const requestedTarball = option("--tarball") ?? process.env.SILENT_ORBIT_TARBALL;
if (!requestedTarball) throw new Error("Usage: node scripts/run-release-tarball-smoke.mjs --tarball <release.tgz>");
const tarball = path.resolve(requestedTarball);
if (!fs.existsSync(tarball)) throw new Error(`Release tarball does not exist: ${tarball}`);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-v1-package-"));
const consumerRoot = path.join(tempRoot, "consumer");
const projectRoot = path.join(tempRoot, "project");
fs.mkdirSync(consumerRoot, { recursive: true });

try {
  runNpm(["init", "-y"], { cwd: consumerRoot });
  runNpm(["install", "--ignore-scripts", "--no-save", tarball], { cwd: consumerRoot });

  const binPath = path.join(consumerRoot, "node_modules", ".bin", process.platform === "win32" ? "silent-orbit.cmd" : "silent-orbit");
  const cli = (args, { json = true } = {}) => process.platform === "win32"
    ? runWindowsShim(binPath, args, { cwd: consumerRoot, json })
    : run(binPath, args, { cwd: consumerRoot, json });
  const cliVersion = cli(["--version"], { json: false });
  if (cliVersion !== "0.4.0") throw new Error(`Expected CLI 0.4.0, received ${cliVersion || "<empty>"}.`);

  cli(["init", projectRoot, "--title", "Silent Orbit v1 package smoke", "--project-id", "v1-package-smoke", "--json"]);
  const initialDoctor = cli(["doctor", "--project", projectRoot, "--json"]);
  if (!["attention", "ok"].includes(initialDoctor.status)) throw new Error(`Initial doctor returned ${initialDoctor.status}.`);
  cli(["import", "--project", projectRoot, "--file", fixturePath, "--json"]);

  const firstScan = cli(["scan", "--project", projectRoot, "--generated-at", generatedAt, "--json"]);
  if (firstScan.report?.observedItems !== 1 || firstScan.report?.errors !== 0) throw new Error("First scan did not observe the controlled Skill.");
  cli(["analyze", "--project", projectRoot, "--json"]);
  const firstDiff = cli(["diff", "--project", projectRoot, "--json"]);
  if (firstDiff.summary?.added !== 1) throw new Error("First diff did not report one added Skill.");
  cli(["generate", "--project", projectRoot, "--json"]);
  const finalDoctor = cli(["doctor", "--project", projectRoot, "--json"]);
  if (finalDoctor.status !== "ok") throw new Error(`Final doctor returned ${finalDoctor.status}.`);
  const audit = cli(["audit", "--project", projectRoot, "--generated-at", generatedAt, "--json"]);
  if (audit.status === "error" || audit.summary?.sourceFailures !== 0) throw new Error("Audit reported a source failure.");

  cli(["scan", "--project", projectRoot, "--generated-at", generatedAt, "--json"]);
  cli(["analyze", "--project", projectRoot, "--json"]);
  const secondDiff = cli(["diff", "--project", projectRoot, "--json"]);
  if (secondDiff.summary?.added !== 0 || secondDiff.summary?.changed !== 0 || secondDiff.summary?.removed !== 0) {
    throw new Error("Second scan/diff is not stable.");
  }

  const installedPackage = path.join(consumerRoot, "node_modules", "silent-orbit-skills-library");
  assertLocalMarkdownLinks({
    rootDir: installedPackage,
    filePaths: walkFiles(installedPackage).filter((candidate) => candidate.endsWith(".md")),
    context: "installed package",
  });
  assertNoPrivatePaths([installedPackage, path.join(projectRoot, "dist")]);

  const receipt = {
    schemaVersion: 1,
    kind: "SilentOrbitV1PackageSmokeReceipt",
    status: "pass",
    platform: process.platform,
    architecture: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    packageVersion: JSON.parse(fs.readFileSync(path.join(installedPackage, "package.json"), "utf8")).version,
    cliVersion,
    tarballSha256: sha256(tarball),
    firstScanItems: firstScan.report.observedItems,
    firstDiffAdded: firstDiff.summary.added,
    finalDoctor: finalDoctor.status,
    auditSourceFailures: audit.summary.sourceFailures,
    secondDiff: secondDiff.summary,
    markdownLinks: "pass",
    privatePathScan: "pass",
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
