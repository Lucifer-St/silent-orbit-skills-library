import { createHash } from "node:crypto";
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
  return {
    publicRoot,
    tarball: path.join(destination, record.filename),
  };
}

function withPackedCurrentRepository(callback) {
  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-v1-preflight-"));
  try {
    return callback(packPublicRelease(packRoot));
  } finally {
    fs.rmSync(packRoot, { recursive: true, force: true });
  }
}

function withPreparedReleaseAssets(callback) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-v1-assets-"));
  const publicRoot = fs.existsSync(path.join(projectDir, "PUBLIC_RELEASE_MANIFEST.json"))
    ? projectDir
    : path.join(projectDir, ".public-release", "rc");
  try {
    const receipt = JSON.parse(run(process.execPath, [
      path.join(projectDir, "scripts", "prepare-v1-release-assets.mjs"),
      "--root",
      publicRoot,
      "--output",
      outputDir,
    ], {
      label: "prepare-release-assets",
      capture: true,
    }));
    const tarballName = `silent-orbit-skills-library-${receipt.release.replace(/^v/, "")}.tgz`;
    return callback({
      outputDir,
      receipt,
      tarball: path.join(outputDir, tarballName),
      tarballName,
      handoff: path.join(outputDir, "V1_RC_ONE_FILE_HANDOFF.zh-CN.md"),
    });
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function resolveChecksumPowerShell() {
  const probe = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "if (-not (Get-Command Get-FileHash -ErrorAction SilentlyContinue)) { exit 1 }",
  ];
  const failures = [];
  for (const command of ["pwsh.exe", "powershell.exe"]) {
    const result = spawnSync(command, probe, {
      cwd: projectDir,
      encoding: "utf8",
      shell: false,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: "pipe",
    });
    if (!result.error && result.status === 0) return command;
    failures.push(`${command}: ${result.error?.code ?? result.status ?? "unknown"}`);
  }
  throw new Error(`No Windows PowerShell runtime exposes Get-FileHash (${failures.join(", ")}).`);
}

function runDocumentedChecksumSmoke(outputDir, tarballName) {
  if (process.platform === "win32") {
    const escapedTarball = tarballName.replaceAll(".", "\\.");
    run(resolveChecksumPowerShell(), [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        `$tarball = '${tarballName}'`,
        `$matches = @(Get-Content -LiteralPath .\\SHA256SUMS.txt | Where-Object { $_ -match '^(?<hash>[0-9A-Fa-f]{64})\\s+\\*?${escapedTarball}$' })`,
        'if ($matches.Count -ne 1) { throw "Expected exactly one checksum entry for $tarball." }',
        "$expected = ([regex]::Match($matches[0], '^[0-9A-Fa-f]{64}').Value).ToLowerInvariant()",
        '$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ".\\$tarball").Hash.ToLowerInvariant()',
        "if ($actual -ne $expected) { throw 'Silent Orbit tarball checksum mismatch.' }",
      ].join("; "),
    ], {
      cwd: outputDir,
      label: "documented-checksum-windows",
      capture: true,
    });
    return;
  }

  const selectExactRow = [
    `tarball='${tarballName}'`,
    'checksum_line="$(awk -v name="$tarball" \'$2 == name || $2 == "*" name { print }\' SHA256SUMS.txt)"',
    'match_count="$(printf \'%s\\n\' "$checksum_line" | awk \'NF { count += 1 } END { print count + 0 }\')"',
    '[ "$match_count" -eq 1 ] || { echo "Expected exactly one checksum entry for $tarball." >&2; exit 1; }',
  ];
  const verify = process.platform === "darwin"
    ? [
      'expected="$(printf \'%s\\n\' "$checksum_line" | awk \'{ print tolower($1) }\')"',
      'actual="$(shasum -a 256 "$tarball" | awk \'{ print tolower($1) }\')"',
      '[ "$actual" = "$expected" ] || { echo "Silent Orbit tarball checksum mismatch." >&2; exit 1; }',
    ]
    : ['printf \'%s\\n\' "$checksum_line" | sha256sum --check -'];
  run("sh", ["-c", [...selectExactRow, ...verify].join("\n")], {
    cwd: outputDir,
    label: process.platform === "darwin"
      ? "documented-checksum-macos"
      : "documented-checksum-linux",
    capture: true,
  });
}

function runPackageSmoke({ tarball, handoff }) {
  const args = [
    path.join(projectDir, "scripts", "run-release-tarball-smoke.mjs"),
    "--tarball",
    tarball,
  ];
  if (handoff) args.push("--handoff", handoff);
  run(process.execPath, args, { label: `package-smoke-${process.platform}` });
}

function runDockerSmoke(tarball) {
  const scriptPath = path.join(projectDir, "scripts", "v1-docker-smoke.sh");
  if (fs.readFileSync(scriptPath).includes(13)) {
    throw new Error("Docker smoke runner must use LF line endings before it is mounted into Linux.");
  }
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

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runReleaseAssetsContract() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-v1-release-assets-"));
  try {
    const receipt = JSON.parse(run(process.execPath, [
      path.join(projectDir, "scripts", "prepare-v1-release-assets.mjs"),
      "--root",
      projectDir,
      "--output",
      outputDir,
    ], {
      label: "release-assets-contract",
      capture: true,
    }));
    const packageVersion = JSON.parse(
      fs.readFileSync(path.join(projectDir, "package.json"), "utf8"),
    ).version;
    const tarball = `silent-orbit-skills-library-${packageVersion}.tgz`;
    const payloads = [
      "PUBLIC_RELEASE_RECEIPT.md",
      "V1_RC_ONE_FILE_HANDOFF.zh-CN.md",
      "codex-global.config.json",
      "silent-orbit-v1-starter.source-import.json",
      tarball,
      "v1-docker-smoke.sh",
    ].sort((left, right) => left.localeCompare(right, "en"));
    const expectedFiles = [...payloads, "SHA256SUMS.txt"].sort((left, right) => left.localeCompare(right, "en"));
    const actualFiles = fs.readdirSync(outputDir).sort((left, right) => left.localeCompare(right, "en"));
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error(`Unexpected release asset set: ${actualFiles.join(", ")}.`);
    }
    if (
      receipt.status !== "pass"
      || receipt.release !== `v${packageVersion}`
      || JSON.stringify(
        [...receipt.assets].sort((left, right) => left.localeCompare(right, "en")),
      ) !== JSON.stringify(expectedFiles)
    ) {
      throw new Error("Release asset receipt does not match the exact expected asset set.");
    }

    const checksumLines = fs.readFileSync(path.join(outputDir, "SHA256SUMS.txt"), "utf8")
      .trim()
      .split(/\r?\n/);
    const checksumRows = checksumLines.map((line) => line.match(/^([0-9a-f]{64})  (\S+)$/));
    if (checksumRows.some((row) => row === null)) {
      throw new Error("SHA256SUMS.txt contains a malformed or unexpected row.");
    }
    if (checksumRows.length !== payloads.length) {
      throw new Error("SHA256SUMS.txt must contain exactly one row per release payload.");
    }
    const checksums = new Map();
    for (const [, hash, name] of checksumRows) {
      if (checksums.has(name) || !payloads.includes(name)) {
        throw new Error(`SHA256SUMS.txt contains an unexpected or duplicate row for ${name}.`);
      }
      checksums.set(name, hash);
      if (sha256(path.join(outputDir, name)) !== hash) {
        throw new Error(`SHA256SUMS.txt does not match ${name}.`);
      }
    }
    if (checksums.size !== payloads.length || !checksums.has(tarball)) {
      throw new Error("SHA256SUMS.txt is missing a required release payload.");
    }
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function runCore({ publicRepository }) {
  const commands = publicRepository
    ? [
      ["validate-public-data", ["run", "validate:data"]],
      ["validate-public-assets", ["run", "validate:assets"]],
      ["validate-public-repository", ["run", "validate:public-repository"]],
      ["validate-public-readme", ["run", "validate:readme"]],
      ["public-mvp", ["run", "test:mvp"]],
    ]
    : [];
  commands.push(
    ["adapter-regressions", ["run", "test:adapters"]],
    ["cli-regressions", ["run", "test:cli"]],
    ["agent-skill-contract", ["run", "test:agent-skill"]],
    ["source-boundary", ["run", "test:boundary"]],
    ["site-release-contract", ["run", "test:site-release"]],
    ["privacy-safe-v1-receipt", ["run", "test:v1-receipt"]],
    ["typescript", ["exec", "--", "tsc", "--noEmit"]],
    ["production-build", ["run", "build"]],
  );
  for (const [label, args] of commands) runNpm(args, { label });
  if (publicRepository) runReleaseAssetsContract();
  run(process.execPath, [path.join(projectDir, "scripts", "smoke-ui.mjs")], {
    label: "first-use-desktop-mobile",
    env: { SMOKE_FIRST_USE_ONLY: "1" },
  });
  runNpm(["audit", "--audit-level=high"], { label: "high-severity-dependency-audit" });
}

assertNode24();
const mode = option("--mode", "private");
const providedTarball = option("--tarball", process.env.SILENT_ORBIT_TARBALL);
const providedHandoff = option("--handoff", process.env.SILENT_ORBIT_HANDOFF);

if (mode === "package-smoke") {
  if (providedTarball) {
    runPackageSmoke({
      tarball: path.resolve(providedTarball),
      handoff: providedHandoff ? path.resolve(providedHandoff) : undefined,
    });
  } else {
    withPreparedReleaseAssets(({ outputDir, tarball, tarballName, handoff }) => {
      runDocumentedChecksumSmoke(outputDir, tarballName);
      runPackageSmoke({ tarball, handoff });
    });
  }
} else if (mode === "docker") {
  if (providedTarball) runDockerSmoke(path.resolve(providedTarball));
  else withPackedCurrentRepository(({ tarball }) => runDockerSmoke(tarball));
} else if (mode === "public-core") {
  runCore({ publicRepository: true });
} else if (mode === "private") {
  runCore({ publicRepository: false });
  runNpm(["run", "test:public-release"], { label: "deterministic-double-public-export" });
  runNpm(["run", "export:public"], { label: "materialize-public-rc" });
  runNpm(["run", "validate:public-release"], { label: "validate-public-rc" });
  withPreparedReleaseAssets(({ outputDir, tarball, tarballName, handoff }) => {
    runDocumentedChecksumSmoke(outputDir, tarballName);
    runPackageSmoke({ tarball, handoff });
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
    ? ["related-regressions", "agent-skill-contract", "typescript-build", "first-use-desktop-mobile", "dependency-audit", "deterministic-double-export", "release-assets-contract", `documented-checksum-${process.platform}`, "release-tarball-smoke", "docker-unmounted-mounted", "privacy-validation"]
    : mode === "public-core"
      ? ["public-core", "public-mvp", "agent-skill-contract", "release-assets-contract"]
      : mode === "package-smoke" && !providedTarball
        ? ["release-assets-contract", `documented-checksum-${process.platform}`, "package-smoke"]
        : [mode],
}, null, 2)}\n`);
