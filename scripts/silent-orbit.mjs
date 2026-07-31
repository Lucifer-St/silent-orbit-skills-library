#!/usr/bin/env node

import {
  auditSilentOrbitProject,
  analyzeSilentOrbitProject,
  diffSilentOrbitProject,
  doctorSilentOrbitProject,
  generateSilentOrbitProject,
  importSilentOrbitSource,
  initSilentOrbitProject,
  scanSilentOrbitProject,
} from "./lib/silent-orbit-project.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createManagementPlanV1,
  createUnknownManagementProvider,
  executeManagementPlanV1,
  validateManagementPlanV1,
} from "./lib/skill-management.mjs";
import {
  createTrustedSourceBatchPlanV1,
  executeTrustedSourceBatchV1,
} from "./lib/trusted-source-maintenance.mjs";
import {
  decideSkillCosmosCustomizationV2,
  doctorSkillCosmosCustomizationV2,
  prepareSkillCosmosCustomizationV2,
  refreshSkillCosmosCustomizationV2,
  statusSkillCosmosCustomizationV2,
} from "./lib/skill-cosmos-customization.mjs";

export const silentOrbitVersion = "0.5.0";

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["json", "dry-run"].includes(key)) options[key] = true;
    else {
      const next = rest[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

function projectDirectory(options) {
  return options.project ?? ".";
}

export function silentOrbitHelpText() {
  return [
    `Silent Orbit CLI ${silentOrbitVersion}`,
    "",
    "Usage:",
    "  silent-orbit init [directory] [--title <title>] [--project-id <id>]",
    "  silent-orbit import --file <source-import.json> [--project <directory>]",
    "  silent-orbit scan [--project <directory>] [--generated-at <ISO timestamp>]",
    "  silent-orbit analyze [--project <directory>]",
    "  silent-orbit diff [--project <directory>]",
    "  silent-orbit generate [--project <directory>]",
    "  silent-orbit doctor [--project <directory>]",
    "  silent-orbit audit [--project <directory>] [--generated-at <ISO timestamp>] [--stale-after-days <days>]",
    "  silent-orbit capabilities",
    "  silent-orbit customize status [--project <directory>]",
    "  silent-orbit customize prepare --request <customization-request.json> [--project <directory>]",
    "  silent-orbit customize decide --request <decision-request.json> [--project <directory>]",
    "  silent-orbit customize refresh [--project <directory>] [--generated-at <ISO timestamp>]",
    "  silent-orbit customize doctor [--project <directory>]",
    "  silent-orbit manage plan --request <management-request.json>",
    "  silent-orbit manage apply --plan <management-plan.json> [--dry-run] [--confirm <exact token>]",
    "  silent-orbit manage check-and-update --request <trusted-batch-request.json> [--confirm <exact batch token>]",
    "",
    "Add --json to emit machine-readable output.",
    "Phase 5C check-and-update requires a host-injected trusted maintenance adapter and pinned skills@1.5.20.",
    "The standalone Provider registry and trusted maintenance host remain empty. Native update is a trusted external direct-write path with no native transaction guarantee.",
  ].join("\n");
}

function summaryFor(command, result) {
  if (command === "init") return `Initialized ${result.projectId} at ${result.projectRoot}.`;
  if (command === "import") return `Imported ${result.sourceKey}; configured sources=${result.sourceCount}.`;
  if (command === "scan") return `Scanned sources=${result.report.scannedSources}, observed=${result.report.observedItems}, inventory=${result.report.inventoryItems}, review-required=${result.report.reviewRequired}, warnings=${result.report.warnings}, errors=${result.report.errors}.`;
  if (command === "analyze") return `Analyzed included=${result.analysisReport.summary.included}, review-required=${result.analysisReport.summary.reviewRequired}, categories=${result.librarySnapshot.categories.length}.`;
  if (command === "diff") return `Diff added=${result.summary.added}, changed=${result.summary.changed}, removed=${result.summary.removed}.`;
  if (command === "generate") return `Generated ${result.summary.skills} Skills in ${result.outputDirectory}; files=${result.receipt.files.length}.`;
  if (command === "doctor") return `Doctor status=${result.status}; checks=${result.checks.length}.`;
  if (command === "audit") return `Audit status=${result.status}; providers=${result.summary.providers}, Skills=${result.summary.skillIdentities}, source-failures=${result.summary.sourceFailures}, duplicates=${result.summary.duplicateIdentities}, identity-conflicts=${result.summary.identityConflicts}, versions-unknown=${result.summary.versionsUnknown}, unresolved=${result.summary.unresolved}.`;
  if (command === "capabilities") return `CLI ${result.cliInterfaceVersion}; customization=${result.capabilities.customization.state}; contract=${result.capabilities.customization.contractFamily}.`;
  if (command === "customize" && result.kind === "CustomizationStatusV2") return `Customization status=${result.status}; rounds=${result.rounds}; active-directions=${result.activeDirections.length}.`;
  if (command === "customize" && result.kind === "CustomizationPrepareResultV2") return `Customization prepared; round=${result.roundId}; directions=${result.directions.length}.`;
  if (command === "customize" && result.kind === "CustomizationDecisionResultV2") return `Customization decision=${result.action}; round=${result.roundId}; direction=${result.directionId ?? "none"}.`;
  if (command === "customize" && result.kind === "CustomizationRefreshResultV2") return `Customization refreshed; snapshot=${result.afterSnapshot}; style-preserved=${result.stylePreserved}.`;
  if (command === "customize" && result.kind === "CustomizationDoctorV2") return `Customization doctor status=${result.status}; checks=${result.checks.length}.`;
  if (command === "manage" && result.planId) return `Management plan=${result.planId}; capability=${result.capability.state}; executable=${result.executable}; targets=${result.targets.length}; changes=${result.changes.length}; confirm exactly: ${result.confirmation.token}`;
  if (command === "manage" && result.kind === "TrustedSourceMaintenanceReceiptV1") return `Trusted source receipt=${result.receiptId}; status=${result.status}; changed=${result.diff?.changed?.length ?? 0}; restored=${result.recovery.restored}.`;
  if (command === "manage" && result.receiptId) return `Management receipt=${result.receiptId}; status=${result.status}; dry-run=${result.dryRun}; rollback=${result.rollback.status}.`;
  if (command === "manage" && result.batchId) return `Trusted source batch=${result.batchId}; executable=${result.executable}; Skills=${result.entries.length}; confirm exactly: ${result.confirmation.token}`;
  if (command === "manage" && result.kind === "TrustedSourceBatchUnavailable") return "Trusted source check-and-update is blocked because no host adapter is injected.";
  return JSON.stringify(result);
}

function readJsonFile(fileName, label) {
  if (!fileName) throw new Error(`${label} file is required.`);
  return JSON.parse(fs.readFileSync(fileName, "utf8"));
}

function managementProvider(registry, providerIdentity) {
  const selected = registry instanceof Map ? registry.get(providerIdentity.id) : registry?.[providerIdentity.id];
  return selected ?? createUnknownManagementProvider({
    providerId: providerIdentity.id,
    providerKind: providerIdentity.kind ?? "unknown",
    label: providerIdentity.label ?? providerIdentity.id,
  });
}

function runManagementCommand(options, dependencies) {
  const action = options._[0];
  const registry = dependencies.managementProviders ?? new Map();
  if (action === "check-and-update") {
    const host = dependencies.trustedSourceMaintenanceHost;
    if (!host) {
      return {
        schemaVersion: 1,
        kind: "TrustedSourceBatchUnavailable",
        status: "blocked",
        blocker: "host-adapter-required",
        executable: false,
      };
    }
    const request = readJsonFile(options.request, "Trusted source batch request");
    const plan = createTrustedSourceBatchPlanV1({
      ...host.planOptions,
      skillNames: request.skillNames,
      allowDisposableSource: host.planOptions.allowDisposableSource === true,
    });
    if (!options.confirm) return plan;
    return executeTrustedSourceBatchV1({
      plan,
      confirmation: options.confirm,
      managerRunner: host.managerRunner,
      rescan: host.rescan,
      synchronize: host.synchronize,
      clock: host.clock,
    });
  }
  if (action === "plan") {
    const rawRequest = readJsonFile(options.request, "Management request");
    const requestedProvider = managementProvider(registry, {
      id: rawRequest.providerId,
      kind: rawRequest.providerKind,
      label: rawRequest.providerLabel,
    });
    const request = {
      ...rawRequest,
      providerKind: rawRequest.providerKind ?? requestedProvider.kind,
      providerLabel: rawRequest.providerLabel ?? requestedProvider.label,
    };
    return createManagementPlanV1({
      provider: requestedProvider,
      request,
      allowedRoots: dependencies.managementAllowedRoots ?? {},
    });
  }
  if (action === "apply") {
    const plan = validateManagementPlanV1(readJsonFile(options.plan, "Management plan"));
    const provider = managementProvider(registry, {
      id: plan.provider.id,
      kind: plan.provider.kind,
      label: plan.provider.label,
    });
    return executeManagementPlanV1({
      plan,
      provider,
      allowedRoots: dependencies.managementAllowedRoots ?? {},
      transactionRoot: dependencies.managementTransactionRoot,
      confirmation: options.confirm,
      dryRun: options["dry-run"] === true,
      clock: dependencies.managementClock,
      faultInjector: dependencies.managementFaultInjector,
    });
  }
  throw new Error("silent-orbit manage requires plan, apply, or check-and-update.");
}

function customizationCapabilities() {
  return {
    schemaVersion: 2,
    kind: "SilentOrbitCapabilitiesV2",
    cliInterfaceVersion: silentOrbitVersion,
    compatibilityFamily: "v1+customization-v2",
    capabilities: {
      generator: {
        state: "supported",
        contractFamily: "v1",
        commands: ["init", "import", "scan", "analyze", "diff", "generate", "doctor", "audit"],
      },
      customization: {
        state: "supported",
        contractFamily: "v2-sidecar",
        commands: ["status", "prepare", "decide", "refresh", "doctor"],
        directionCount: 2,
        decisions: ["keep", "adjust", "reject", "redo"],
        refreshSafe: true,
      },
      management: {
        state: "host-dependent",
        contractFamily: "v1",
      },
    },
  };
}

function runCustomizationCommand(options) {
  const action = options._[0];
  const project = projectDirectory(options);
  if (action === "status") return statusSkillCosmosCustomizationV2({ projectDirectory: project });
  if (action === "prepare") {
    return prepareSkillCosmosCustomizationV2({
      projectDirectory: project,
      request: readJsonFile(options.request, "Customization prepare request"),
    });
  }
  if (action === "decide") {
    return decideSkillCosmosCustomizationV2({
      projectDirectory: project,
      request: readJsonFile(options.request, "Customization decision request"),
    });
  }
  if (action === "refresh") {
    return refreshSkillCosmosCustomizationV2({
      projectDirectory: project,
      generatedAt: options["generated-at"] ?? new Date().toISOString(),
    });
  }
  if (action === "doctor") return doctorSkillCosmosCustomizationV2({ projectDirectory: project });
  throw new Error("silent-orbit customize requires status, prepare, decide, refresh, or doctor.");
}

export function runSilentOrbitCli(argv, dependencies = {}) {
  const { command, options } = parseArguments(argv);
  if (["help", "--help", "-h"].includes(command)) {
    return { command: "help", stdout: `${silentOrbitHelpText()}\n`, exitCode: 0 };
  }
  if (["version", "--version", "-v"].includes(command)) {
    return { command: "version", stdout: `${silentOrbitVersion}\n`, exitCode: 0 };
  }

  let result;
  if (command === "init") result = initSilentOrbitProject({ projectDirectory: options._[0] ?? projectDirectory(options), title: options.title, projectId: options["project-id"] });
  else if (command === "import") result = importSilentOrbitSource({ projectDirectory: projectDirectory(options), inputFile: options.file });
  else if (command === "scan") result = scanSilentOrbitProject({ projectDirectory: projectDirectory(options), generatedAt: options["generated-at"] });
  else if (command === "analyze") result = analyzeSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "diff") result = diffSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "generate") result = generateSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "doctor") result = doctorSilentOrbitProject({ projectDirectory: projectDirectory(options) });
  else if (command === "audit") {
    const rawStaleAfterDays = options["stale-after-days"];
    const staleAfterDays = rawStaleAfterDays === undefined ? undefined : Number(rawStaleAfterDays);
    if (rawStaleAfterDays !== undefined && (!Number.isFinite(staleAfterDays) || staleAfterDays < 0)) throw new Error("--stale-after-days must be a non-negative number.");
    result = auditSilentOrbitProject({ projectDirectory: projectDirectory(options), generatedAt: options["generated-at"], staleAfterDays });
  }
  else if (command === "capabilities") result = customizationCapabilities();
  else if (command === "customize") result = runCustomizationCommand(options);
  else if (command === "manage") result = runManagementCommand(options, dependencies);
  else throw new Error(`Unknown command ${command}. Run silent-orbit help.`);

  const stdout = options.json ? `${JSON.stringify(result, null, 2)}\n` : `${summaryFor(command, result)}\n`;
  const managementFailure = command === "manage"
    && ((result.receiptId && !["dry-run", "succeeded"].includes(result.status))
      || result.kind === "TrustedSourceBatchUnavailable");
  const customizationFailure = command === "customize"
    && result.kind === "CustomizationDoctorV2"
    && result.status === "error";
  const exitCode = (["doctor", "audit"].includes(command) && result.status === "error") || managementFailure || customizationFailure ? 1 : 0;
  return { command, result, stdout, exitCode };
}

async function main() {
  const execution = runSilentOrbitCli(process.argv.slice(2));
  process.stdout.write(execution.stdout);
  process.exitCode = execution.exitCode;
}

export function isSilentOrbitCliEntrypoint(candidate = process.argv[1]) {
  if (!candidate) return false;
  try {
    return fs.realpathSync(candidate) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isSilentOrbitCliEntrypoint()) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
