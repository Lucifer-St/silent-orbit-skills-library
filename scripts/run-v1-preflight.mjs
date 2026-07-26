import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function npmInvocation(args) {
  const npmCli = process.env.npm_execpath;
  if (npmCli && fs.existsSync(npmCli)) return [process.execPath, [npmCli, ...args]];
  return [process.platform === "win32" ? "npm.cmd" : "npm", args];
}

function runNpm(args, options = {}) {
  const [command, expandedArgs] = npmInvocation(args);
  return run(command, expandedArgs, options);
}

function run(command, args, {
  cwd = projectDir,
  env = {},
  label = `${path.basename(command)} ${args[0] ?? ""}`,
  capture = false,
} = {}) {
  process.stdout.write(`PREFLIGHT_STEP=${label}\n`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, NO_COLOR: "1", ...env },
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? result.stderr || result.stdout : "";
    throw new Error(`${label} failed (${result.status}).${detail ? `\n${detail}` : ""}`);
  }
  return capture ? result.stdout.trim() : "";
}

function assertNode24() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 24) throw new Error(`preflight:v1 requires Node.js 24; received ${process.version}.`);
}

function packPublicRelease(destination) {
  const publicRoot = fs.existsSync(path.join(projectDir, "PUBLIC_RELEASE_MANIFEST.json"))
    ? projectDir
    : path.join(projectDir, ".public-release", "rc");
  const output = runNpm(["pack", "--json", "--pack-destination", destination], {
    cwd: publicRoot,
    label: "pack-public-release",
    capture: true,
  });
  const records = JSON.parse(output);
  const record = Array.isArray(records) ? records[0] : records;
  if (!record?.filename) throw new Error("npm pack did not report a tarball filename.");
  return path.join(destination, record.filename);
}

function withPackedCurrentRepository(callback) {
  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-v1-preflight-"));
  try {
    return callback(packPublicRelease(packRoot));
  } finally {
    fs.rmSync(packRoot, { recursive: true, force: true });
  }
}

function runPackageSmoke(tarball) {
  run(process.execPath, [
    path.join(projectDir, "scripts", "run-release-tarball-smoke.mjs"),
    "--tarball",
    tarball,
  ], { label: `package-smoke-${process.platform}` });
}

function runDockerSmoke(tarball) {
  const scriptPath = path.join(projectDir, "scripts", "v1-docker-smoke.sh");
  const configPath = path.join(projectDir, "scripts", "fixtures", "v1-preflight", "codex-global.config.json");
  const mountedAgents = path.join(projectDir, "scripts", "fixtures", "v1-preflight", "docker-home", ".agents");
  const containerHome = ["", "tmp", "home"].join("/");
  for (const scenario of ["unmounted", "mounted"]) {
    const args = [
      "run", "--rm",
      "-e", `HOME=${containerHome}`,
      "-e", "SILENT_ORBIT_TARBALL=/input/release.tgz",
      "-e", "SILENT_ORBIT_CONFIG=/fixture/codex-global.config.json",
      "-e", `SILENT_ORBIT_SCENARIO=${scenario}`,
      "-v", `${tarball}:/input/release.tgz:ro`,
      "-v", `${configPath}:/fixture/codex-global.config.json:ro`,
      "-v", `${scriptPath}:/runner/v1-docker-smoke.sh:ro`,
    ];
    if (scenario === "mounted") args.push("-v", `${mountedAgents}:${containerHome}/.agents:ro`);
    args.push("node:24-bookworm-slim", "sh", "/runner/v1-docker-smoke.sh");
    run("docker", args, { label: `docker-${scenario}`, capture: true });
  }
}

function runCore({ publicRepository }) {
  const commands = publicRepository
    ? [
      ["validate-public-data", ["run", "validate:data"]],
      ["validate-public-assets", ["run", "validate:assets"]],
      ["validate-public-repository", ["run", "validate:public-repository"]],
      ["validate-public-readme", ["run", "validate:readme"]],
    ]
    : [];
  commands.push(
    ["adapter-regressions", ["run", "test:adapters"]],
    ["cli-regressions", ["run", "test:cli"]],
    ["source-boundary", ["run", "test:boundary"]],
    ["site-release-contract", ["run", "test:site-release"]],
    ["privacy-safe-v1-receipt", ["run", "test:v1-receipt"]],
    ["typescript", ["exec", "--", "tsc", "--noEmit"]],
    ["production-build", ["run", "build"]],
  );
  for (const [label, args] of commands) runNpm(args, { label });
  run(process.execPath, [path.join(projectDir, "scripts", "smoke-ui.mjs")], {
    label: "first-use-desktop-mobile",
    env: { SMOKE_FIRST_USE_ONLY: "1" },
  });
  runNpm(["audit", "--audit-level=high"], { label: "high-severity-dependency-audit" });
}

assertNode24();
const mode = option("--mode", "private");
const providedTarball = option("--tarball", process.env.SILENT_ORBIT_TARBALL);

if (mode === "package-smoke") {
  if (providedTarball) runPackageSmoke(path.resolve(providedTarball));
  else withPackedCurrentRepository(runPackageSmoke);
} else if (mode === "docker") {
  if (providedTarball) runDockerSmoke(path.resolve(providedTarball));
  else withPackedCurrentRepository(runDockerSmoke);
} else if (mode === "public-core") {
  runCore({ publicRepository: true });
} else if (mode === "private") {
  runCore({ publicRepository: false });
  runNpm(["run", "test:public-release"], { label: "deterministic-double-public-export" });
  runNpm(["run", "export:public"], { label: "materialize-public-rc" });
  runNpm(["run", "validate:public-release"], { label: "validate-public-rc" });
  withPackedCurrentRepository((tarball) => {
    runPackageSmoke(tarball);
    runDockerSmoke(tarball);
  });
} else {
  throw new Error(`Unknown preflight:v1 mode: ${mode}`);
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  kind: "SilentOrbitV1PreflightReceipt",
  status: "pass",
  mode,
  platform: process.platform,
  architecture: process.arch,
  nodeMajor: 24,
  checks: mode === "private"
    ? ["related-regressions", "typescript-build", "first-use-desktop-mobile", "dependency-audit", "deterministic-double-export", "release-tarball-smoke", "docker-unmounted-mounted", "privacy-validation"]
    : [mode],
}, null, 2)}\n`);
