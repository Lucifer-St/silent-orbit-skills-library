import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publicReleaseVersion } from "./public-release-config.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, { cwd }) {
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
    throw new Error(`${path.basename(command)} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function runNpm(args, { cwd }) {
  const npmCli = process.env.npm_execpath;
  if (npmCli && fs.existsSync(npmCli)) return run(process.execPath, [npmCli, ...args], { cwd });
  if (process.platform === "win32") {
    return run("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `& ${quotePowerShell("npm.cmd")} ${args.map(quotePowerShell).join(" ")}`,
    ], { cwd });
  }
  return run("npm", args, { cwd });
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function requireFile(rootDir, relativePath) {
  const filePath = path.join(rootDir, ...relativePath.split("/"));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Public release input is missing ${relativePath}.`);
  }
  return filePath;
}

function assertEmptyOutput(outputDir) {
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length !== 0) {
    throw new Error("Release asset output must be a new or empty directory.");
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 24) {
  throw new Error(`prepare:v1-release-assets requires Node.js 24; received ${process.version}.`);
}

const requestedOutput = option("--output");
if (!requestedOutput) {
  throw new Error("Usage: npm run prepare:v1-release-assets -- --output <new-empty-directory>");
}

const rootDir = path.resolve(option("--root") ?? projectDir);
const outputDir = path.resolve(requestedOutput);
if (outputDir === rootDir) throw new Error("Release asset output cannot be the Public repository root.");
assertEmptyOutput(outputDir);

const packageJson = JSON.parse(fs.readFileSync(requireFile(rootDir, "package.json"), "utf8"));
if (packageJson.name !== "silent-orbit-skills-library" || packageJson.version !== publicReleaseVersion) {
  throw new Error(`Expected Public package silent-orbit-skills-library@${publicReleaseVersion}.`);
}
requireFile(rootDir, "PUBLIC_RELEASE_MANIFEST.json");

const handoffSource = requireFile(rootDir, "docs/testing/v1-rc-one-file-handoff.zh-CN.md");
const novicePackTemplateSource = requireFile(rootDir, "docs/testing/silent-orbit-novice-human-test-pack.zh-CN.template.md");
const handoffBytes = fs.readFileSync(handoffSource);
if (handoffBytes.subarray(0, 3).toString("hex") !== "efbbbf") {
  throw new Error("Public handoff must be UTF-8 with BOM.");
}
const handoffText = handoffBytes.toString("utf8").replace(/^\uFEFF/, "");
for (const expected of [
  `v${publicReleaseVersion}`,
  `https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v${publicReleaseVersion}`,
  `silent-orbit-skills-library-${publicReleaseVersion}.tgz`,
  "V1_RC_ONE_FILE_HANDOFF.zh-CN.md",
]) {
  if (!handoffText.includes(expected)) throw new Error(`Public handoff is missing ${expected}.`);
}
if (handoffText.includes("{{")) {
  throw new Error("Public handoff contains an unresolved template token.");
}

const copyInputs = [
  ["docs/testing/v1-rc-one-file-handoff.zh-CN.md", "V1_RC_ONE_FILE_HANDOFF.zh-CN.md"],
  ["PUBLIC_RELEASE_RECEIPT.md", "PUBLIC_RELEASE_RECEIPT.md"],
  ["scripts/fixtures/v1-preflight/codex-global.config.json", "codex-global.config.json"],
  ["scripts/fixtures/v1-preflight/starter.source-import.json", "silent-orbit-v1-starter.source-import.json"],
  ["scripts/v1-docker-smoke.sh", "v1-docker-smoke.sh"],
];
for (const [source, target] of copyInputs) {
  fs.copyFileSync(requireFile(rootDir, source), path.join(outputDir, target));
}

const packOutput = runNpm(["pack", "--json", "--pack-destination", outputDir], { cwd: rootDir });
const packRecords = JSON.parse(packOutput);
const packRecord = Array.isArray(packRecords) ? packRecords[0] : packRecords;
const expectedTarball = `silent-orbit-skills-library-${publicReleaseVersion}.tgz`;
if (packRecord?.filename !== expectedTarball) {
  throw new Error(`npm pack produced ${packRecord?.filename ?? "<unknown>"}; expected ${expectedTarball}.`);
}

const tarballSha256 = sha256(path.join(outputDir, expectedTarball));
const releaseTag = `v${publicReleaseVersion}`;
const releaseUrl = `https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/${releaseTag}`;
const novicePackName = "SILENT_ORBIT_NOVICE_HUMAN_TEST_PACK.zh-CN.md";
const novicePackTemplate = fs.readFileSync(novicePackTemplateSource, "utf8");
const fixedNovicePackBindings = [
  {
    token: "{{PUBLIC_RELEASE_TAG}}",
    lines: [`- Release：\`${releaseTag}\``, `  "release": "${releaseTag}",`],
  },
  {
    token: "{{PUBLIC_RELEASE_URL}}",
    lines: [`- Release 页面：${releaseUrl}`],
  },
  {
    token: "{{PUBLIC_TARBALL_FILE}}",
    lines: [`- 安装资产：\`${expectedTarball}\``, `  "releaseAsset": "${expectedTarball}",`],
  },
];
const novicePackTemplateLines = novicePackTemplate.split(/\r?\n/u);
for (const binding of fixedNovicePackBindings) {
  if (novicePackTemplate.includes(binding.token)) {
    throw new Error(`Novice human test pack template still contains fixed token ${binding.token}.`);
  }
  for (const expectedLine of binding.lines) {
    const occurrences = novicePackTemplateLines.filter((line) => line === expectedLine).length;
    if (occurrences !== 1) {
      throw new Error(`Novice human test pack template must contain exactly one fixed binding line: ${expectedLine}`);
    }
  }
}
const novicePackBindings = new Map([
  ["{{PUBLIC_TARBALL_URL}}", `https://github.com/Lucifer-St/silent-orbit-skills-library/releases/download/${releaseTag}/${expectedTarball}`],
  ["{{PUBLIC_TARBALL_SHA256}}", tarballSha256],
]);
for (const token of novicePackBindings.keys()) {
  if (!novicePackTemplate.includes(token)) throw new Error(`Novice human test pack template is missing required token ${token}.`);
}
const novicePack = [...novicePackBindings].reduce((content, [token, value]) => content.replaceAll(token, value), novicePackTemplate);
if (novicePack.includes("{{")) throw new Error("Novice human test pack contains an unresolved template token.");
fs.writeFileSync(path.join(outputDir, novicePackName), novicePack, "utf8");

const assetNames = [
  ...copyInputs.map(([, target]) => target),
  expectedTarball,
  novicePackName,
].sort((left, right) => left.localeCompare(right, "en"));
for (const name of assetNames) requireFile(outputDir, name);
const hashes = Object.fromEntries(assetNames.map((name) => [name, sha256(path.join(outputDir, name))]));
fs.writeFileSync(
  path.join(outputDir, "SHA256SUMS.txt"),
  `${assetNames.map((name) => `${hashes[name]}  ${name}`).join("\n")}\n`,
  "utf8",
);

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  kind: "SilentOrbitV1ReleaseAssetsReceipt",
  status: "pass",
  release: `v${publicReleaseVersion}`,
  nodeMajor,
  assets: [...assetNames, "SHA256SUMS.txt"],
  sha256: hashes,
  handoffContract: "pass",
  handoffUtf8Bom: "pass",
  novicePack: novicePackName,
  novicePackReleaseBinding: "pass",
}, null, 2)}\n`);
