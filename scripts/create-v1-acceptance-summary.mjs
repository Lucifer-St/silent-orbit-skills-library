import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditSilentOrbitProject,
  diffSilentOrbitProject,
  doctorSilentOrbitProject,
} from "./lib/silent-orbit-project.mjs";
import { silentOrbitVersion } from "./silent-orbit.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function choice(value, label) {
  if (!["pass", "failed", "not-tested", "not-run"].includes(value)) {
    throw new Error(`${label} must be pass, failed, not-tested, or not-run.`);
  }
  return value;
}

export function createV1AcceptanceReceipt({
  packageVersion,
  cliVersion,
  nodeVersion,
  platform,
  architecture,
  doctor,
  audit,
  diff,
  dockerUnmounted = "not-tested",
  dockerMounted = "not-tested",
  trustedMaintenance = "not-run",
}) {
  return {
    schemaVersion: 1,
    kind: "SilentOrbitV1ExternalAcceptanceReceipt",
    status: doctor.status === "ok"
      && audit.status !== "error"
      && diff.added === 0
      && diff.changed === 0
      && diff.removed === 0
      && dockerUnmounted !== "failed"
      && dockerMounted !== "failed"
      && trustedMaintenance !== "failed"
      ? "core-pass"
      : "failed",
    environment: {
      platform,
      architecture,
      nodeMajor: Number(nodeVersion.split(".")[0]),
      packageVersion,
      cliVersion,
    },
    core: {
      doctor: doctor.status,
      audit: audit.status,
      auditSourceFailures: audit.sourceFailures,
      secondDiff: diff,
    },
    optionalDocker: {
      unmountedDiagnostic: dockerUnmounted,
      mountedScan: dockerMounted,
    },
    trustedSourceMaintenance: trustedMaintenance,
    privacy: {
      rawLogsIncluded: false,
      absolutePathsIncluded: false,
      skillNamesIncluded: false,
      promptsIncluded: false,
      localRecordsIncluded: false,
    },
    acceptanceAuthority: "independent-human-result-required",
  };
}

export function assertPrivacySafeV1Receipt(receipt) {
  const serialized = JSON.stringify(receipt);
  const stringValues = [];
  const collectStrings = (value) => {
    if (typeof value === "string") stringValues.push(value);
    else if (Array.isArray(value)) value.forEach(collectStrings);
    else if (value && typeof value === "object") Object.values(value).forEach(collectStrings);
  };
  collectStrings(receipt);
  const forbidden = [
    os.homedir(),
    process.env.USERPROFILE,
    process.env.HOME,
    process.env.CODEX_HOME,
    ["C:", "Users", ""].join("\\"),
    ["C:", "Users", ""].join("/"),
    "/Users/",
    "/home/",
  ].filter((value) => value && value.length >= 7);
  if (forbidden.some((value) => stringValues.some((candidate) => candidate.includes(value)))) {
    throw new Error("Acceptance receipt contains an absolute or private path.");
  }
  if (/"projectRoot"|"inventoryPath"|"receiptPath"|"outputDirectory"|"skills"\s*:|"name"\s*:/i.test(serialized)) {
    throw new Error("Acceptance receipt contains a forbidden raw field.");
  }
  return receipt;
}

function main() {
  const project = option("--project");
  const output = option("--out", "silent-orbit-v1-acceptance-receipt.json");
  if (!project) throw new Error("--project is required.");
  const projectRoot = path.resolve(project);
  const packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version;
  const doctor = doctorSilentOrbitProject({ projectDirectory: projectRoot });
  const audit = auditSilentOrbitProject({ projectDirectory: projectRoot });
  const diff = diffSilentOrbitProject({ projectDirectory: projectRoot });
  const receipt = assertPrivacySafeV1Receipt(createV1AcceptanceReceipt({
    packageVersion,
    cliVersion: silentOrbitVersion,
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    doctor: { status: doctor.status },
    audit: { status: audit.status, sourceFailures: audit.summary.sourceFailures },
    diff: diff.summary,
    dockerUnmounted: choice(option("--docker-unmounted", "not-tested"), "--docker-unmounted"),
    dockerMounted: choice(option("--docker-mounted", "not-tested"), "--docker-mounted"),
    trustedMaintenance: choice(option("--trusted-maintenance", "not-run"), "--trusted-maintenance"),
  }));
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status !== "core-pass") process.exitCode = 1;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
