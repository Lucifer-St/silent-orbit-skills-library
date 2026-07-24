import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCapabilityEvidenceV1,
  createProviderCapabilityV1,
  managementOperations,
  trustedExternalManagerExceptions,
} from "./skill-management.mjs";
import {
  computeSkillFolderHash,
  trustedSkillsManagerContract as managerContract,
} from "./trusted-source-maintenance.mjs";

export const npxSkillsSourceManagedProviderId = "npx-skills-source-managed-codex-global";
export const npxSkillsSourceManagedProviderKind = "source-managed";
export const phase5bDisposableMarker = ".silent-orbit-phase5b-disposable.json";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertRealDirectory(value, label) {
  invariant(typeof value === "string" && path.isAbsolute(value), `${label} must be an explicit absolute path.`);
  const resolved = path.resolve(value);
  const stats = fs.lstatSync(resolved, { throwIfNoEntry: false });
  invariant(stats?.isDirectory() && !stats.isSymbolicLink(), `${label} must be an existing real directory.`);
  return resolved;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${label} is missing or invalid.`);
  }
}

function sanitizeSkillName(value) {
  invariant(typeof value === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(value), "Provider skillName must be one exact portable Skill name.");
  return value;
}

function normalizeCandidateRelativePath(value) {
  invariant(typeof value === "string" && !path.isAbsolute(value), "candidateSkillRelativePath must be relative.");
  if (value === ".") return value;
  const portable = value.replace(/\\/g, "/");
  const segments = portable.split("/");
  invariant(
    segments.length > 0
      && segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== "." && segment !== ".."),
    "candidateSkillRelativePath must stay inside the candidate repository.",
  );
  return segments.join("/");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const supportedEvidence = createCapabilityEvidenceV1({
  providerId: npxSkillsSourceManagedProviderId,
  operation: "update",
  kind: "trusted-external-contract",
  claim: "skills 1.5.20 supports one exact source-managed update when a host explicitly injects a marked disposable profile and accepts the native manager exceptions.",
  basis: {
    package: managerContract,
    command: ["update", "<exact-skill>", "-g", "-y"],
    scope: "host-injected-disposable-codex-profile-only",
    exactSkillFilter: true,
    postUpdateVerification: ["lock-source", "lock-folder-hash", "installed-folder-hash", "candidate-revision"],
    outerCoreGuards: ["pre-digest", "profile-backup", "rescan", "provider-verify", "restore-pre-digest"],
    nativeGuarantees: {
      coreWriter: false,
      isolatedStaging: false,
      transactionRollback: false,
    },
    acceptedExceptions: trustedExternalManagerExceptions,
  },
});

const capability = createProviderCapabilityV1({
  providerId: npxSkillsSourceManagedProviderId,
  providerKind: npxSkillsSourceManagedProviderKind,
  label: "npx skills source-managed Codex global Skill",
  operations: {
    update: {
      state: "supported",
      evidenceIds: [supportedEvidence.id],
    },
  },
  evidence: [supportedEvidence],
});

export const npxSkillsSourceManagedEvaluation = deepFreeze({
  schemaVersion: 1,
  phase: "5B",
  decision: "go",
  provider: capability.provider,
  operation: "update",
  capabilityId: capability.capabilityId,
  scope: "host-injected-disposable-codex-profile-only",
  manager: managerContract,
  acceptedExceptions: trustedExternalManagerExceptions,
  nativeTransactionGuarantee: false,
  otherOperations: {
    install: "unknown",
    freeze: "unknown",
    remove: "unknown",
    restore: "unknown",
  },
});

function assertManagerPackage(packageRoot) {
  const resolved = assertRealDirectory(packageRoot, "skills packageRoot");
  const packageJsonPath = path.join(resolved, "package.json");
  const cliEntry = path.join(resolved, "bin", "cli.mjs");
  const bundledCli = path.join(resolved, "dist", "cli.mjs");
  const packageJsonBytes = fs.readFileSync(packageJsonPath);
  const packageJson = JSON.parse(packageJsonBytes.toString("utf8"));
  invariant(packageJson.name === managerContract.name && packageJson.version === managerContract.version, "Injected skills package identity does not match 1.5.20.");
  invariant(sha256(packageJsonBytes) === managerContract.packageJsonSha256, "Injected skills package metadata digest drifted.");
  invariant(sha256(fs.readFileSync(bundledCli)) === managerContract.cliSha256, "Injected skills CLI digest drifted.");
  invariant(fs.lstatSync(cliEntry).isFile(), "Injected skills CLI entry is missing.");
  return { packageRoot: resolved, cliEntry };
}

function assertDisposableProfile(profileRoot) {
  const resolved = assertRealDirectory(profileRoot, "disposable profileRoot");
  invariant(path.resolve(resolved) !== path.resolve(os.homedir()), "The real home directory can never be a Phase 5B profile.");
  invariant(isWithin(os.tmpdir(), resolved), "Phase 5B profileRoot must stay inside the operating-system temporary directory.");
  const marker = readJson(path.join(resolved, phase5bDisposableMarker), "Phase 5B disposable marker");
  invariant(
    marker.schemaVersion === 1
      && marker.purpose === "silent-orbit-phase5b"
      && marker.disposable === true,
    "Phase 5B disposable marker is invalid.",
  );
  for (const relative of [".codex", ".state", ".tmp", ".appdata", ".localappdata", ".config"]) {
    assertRealDirectory(path.join(resolved, relative), `disposable profile ${relative}`);
  }
  return resolved;
}

function candidateState(candidateRoot, candidateSkillRelativePath) {
  const repository = assertRealDirectory(candidateRoot, "candidateRoot");
  invariant(isWithin(os.tmpdir(), repository), "Phase 5B candidateRoot must stay inside the operating-system temporary directory.");
  const relativePath = normalizeCandidateRelativePath(candidateSkillRelativePath);
  let skillRoot = repository;
  if (relativePath !== ".") {
    for (const segment of relativePath.split("/")) {
      skillRoot = path.join(skillRoot, segment);
      const stats = fs.lstatSync(skillRoot, { throwIfNoEntry: false });
      invariant(stats && !stats.isSymbolicLink(), "Candidate Skill path must not traverse a symbolic link or junction.");
    }
    skillRoot = assertRealDirectory(skillRoot, "candidate Skill root");
    invariant(isWithin(repository, skillRoot), "Candidate Skill root escaped its repository.");
  }
  invariant(fs.existsSync(path.join(skillRoot, "SKILL.md")), "Candidate Skill must contain SKILL.md.");
  let revision;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    throw new Error("Candidate must be a committed local Git repository.");
  }
  invariant(/^[a-f0-9]{40}$/.test(revision), "Candidate revision is invalid.");
  return {
    repository,
    skillRoot,
    revision,
    folderHash: computeSkillFolderHash(skillRoot),
  };
}

function createProfileEnvironment(profileRoot) {
  return {
    ...process.env,
    USERPROFILE: profileRoot,
    HOME: profileRoot,
    XDG_STATE_HOME: path.join(profileRoot, ".state"),
    XDG_CONFIG_HOME: path.join(profileRoot, ".config"),
    CODEX_HOME: path.join(profileRoot, ".codex"),
    APPDATA: path.join(profileRoot, ".appdata"),
    LOCALAPPDATA: path.join(profileRoot, ".localappdata"),
    TEMP: path.join(profileRoot, ".tmp"),
    TMP: path.join(profileRoot, ".tmp"),
    DISABLE_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
    GITHUB_TOKEN: "",
    GH_TOKEN: "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(profileRoot, ".config", "gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    NO_COLOR: "1",
  };
}

function defaultManagerRunner({ cliEntry, skillName, profileRoot, env }) {
  return spawnSync(process.execPath, [cliEntry, "update", skillName, "-g", "-y"], {
    cwd: profileRoot,
    env,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function createNpxSkillsSourceManagedProvider({
  packageRoot,
  profileRoot,
  candidateRoot,
  candidateSkillRelativePath = ".",
  skillName,
  expectedSource,
  expectedSourceType,
  sourceIdentity,
  targetId = "disposable-profile",
  managerRunner = defaultManagerRunner,
} = {}) {
  const exactSkillName = sanitizeSkillName(skillName);
  invariant(typeof expectedSource === "string" && expectedSource.length > 0, "Provider expectedSource is required.");
  invariant(["github", "git", "gitlab"].includes(expectedSourceType), "Provider expectedSourceType is invalid.");
  invariant(
    typeof sourceIdentity === "string"
      && sourceIdentity.split("/").every((segment) => /^[a-z0-9][a-z0-9._-]*$/.test(segment) && segment !== ".."),
    "Provider sourceIdentity must be portable.",
  );
  sanitizeSkillName(targetId);
  const exactCandidateRelativePath = normalizeCandidateRelativePath(candidateSkillRelativePath);
  invariant(typeof managerRunner === "function", "Provider managerRunner must be a function.");

  const manager = assertManagerPackage(packageRoot);
  const profile = assertDisposableProfile(profileRoot);
  const sourceDigest = sha256(expectedSource);

  function lockPath() {
    return path.join(profile, ".state", "skills", ".skill-lock.json");
  }

  function installedSkillRoot() {
    return path.join(profile, ".agents", "skills", exactSkillName);
  }

  function bindingState() {
    assertDisposableProfile(profile);
    assertManagerPackage(manager.packageRoot);
    const candidate = candidateState(candidateRoot, exactCandidateRelativePath);
    const lock = readJson(lockPath(), "Disposable skills lock");
    const entry = lock.skills?.[exactSkillName];
    invariant(entry && typeof entry === "object", "Exact Skill is not present in the disposable global lock.");
    invariant(entry.pluginName === undefined, "Plugin-provided Skills are outside this Provider.");
    invariant(entry.source === expectedSource, "Disposable Skill source mismatch.");
    invariant(entry.sourceType === expectedSourceType, "Disposable Skill source type mismatch.");
    invariant(typeof entry.skillFolderHash === "string" && /^[a-f0-9]{40,64}$/.test(entry.skillFolderHash), "Disposable lock folder hash is invalid.");
    const installedRoot = assertRealDirectory(installedSkillRoot(), "disposable installed Skill");
    const installedFolderHash = computeSkillFolderHash(installedRoot);
    invariant(installedFolderHash === entry.skillFolderHash, "Disposable installed Skill drifted from its lock hash.");
    return {
      entry,
      installedFolderHash,
      candidate,
      noUpdate: installedFolderHash === candidate.folderHash,
    };
  }

  const execution = deepFreeze({
    mode: "trusted-external-manager",
    manager: managerContract,
    nativeTransactionGuarantee: false,
    exceptions: trustedExternalManagerExceptions,
  });

  const provider = {
    id: npxSkillsSourceManagedProviderId,
    kind: npxSkillsSourceManagedProviderKind,
    label: capability.provider.label,
    capability,
    evaluation: npxSkillsSourceManagedEvaluation,
    execution,
    probeCapability({ operation } = {}) {
      invariant(managementOperations.includes(operation), `Unsupported management operation ${operation}.`);
      assertDisposableProfile(profile);
      assertManagerPackage(manager.packageRoot);
      candidateState(candidateRoot, exactCandidateRelativePath);
      const record = capability.operations[operation];
      return Object.freeze({
        state: record.state,
        capabilityId: capability.capabilityId,
        evidenceIds: record.evidenceIds,
      });
    },
    preview({ operation, targets, parameters } = {}) {
      invariant(operation === "update", "This Provider supports update only.");
      invariant(Array.isArray(targets) && targets.length === 1 && targets[0].id === targetId, "Provider requires one exact disposable profile target.");
      invariant(
        parameters?.skill === exactSkillName
          && parameters?.scope === "global"
          && parameters?.sourceIdentity === sourceIdentity
          && parameters?.managerVersion === managerContract.version,
        "Provider request does not match the bound exact Skill and source.",
      );
      const state = bindingState();
      return {
        changes: [],
        blockers: state.noUpdate ? ["no-update"] : [],
        executionEvidence: {
          scope: "host-injected-disposable-codex-profile-only",
          targetId,
          skill: exactSkillName,
          sourceIdentity,
          sourceType: expectedSourceType,
          sourceDigest,
          currentFolderHash: state.installedFolderHash,
          candidateFolderHash: state.candidate.folderHash,
          candidateRevision: state.candidate.revision,
          verificationPolicy: "manager-lock-and-installed-folder-hash",
        },
      };
    },
    apply({ plan, external } = {}) {
      invariant(plan.operation === "update" && plan.execution.mode === "trusted-external-manager", "Provider received an incompatible plan.");
      invariant(external?.targets?.[targetId] === profile, "Provider target does not match its injected disposable profile.");
      const before = bindingState();
      invariant(before.installedFolderHash === plan.execution.evidence.currentFolderHash, "Provider target drifted before native update.");
      invariant(before.candidate.folderHash === plan.execution.evidence.candidateFolderHash, "Provider candidate hash drifted.");
      invariant(before.candidate.revision === plan.execution.evidence.candidateRevision, "Provider candidate revision drifted.");
      invariant(!before.noUpdate, "Provider refused a native no-update execution.");
      const result = managerRunner({
        cliEntry: manager.cliEntry,
        skillName: exactSkillName,
        profileRoot: profile,
        env: createProfileEnvironment(profile),
      });
      invariant(result && Number.isInteger(result.status), "Trusted external manager did not return an exit status.");
      invariant(result.status === 0, "Trusted external manager update failed.");
    },
    rescan({ plan, reader } = {}) {
      return {
        targets: plan.targets.map((target) => ({
          targetId: target.id,
          digest: reader.digest(target.id),
        })),
      };
    },
    verify({ plan } = {}) {
      const after = bindingState();
      invariant(after.candidate.folderHash === plan.execution.evidence.candidateFolderHash, "Candidate hash changed during verification.");
      invariant(after.candidate.revision === plan.execution.evidence.candidateRevision, "Candidate revision changed during verification.");
      invariant(after.installedFolderHash === after.candidate.folderHash, "Installed Skill does not match the committed verification candidate.");
      invariant(after.entry.skillFolderHash === after.candidate.folderHash, "Manager lock does not match the committed verification candidate.");
      return {
        ok: true,
        evidence: [{
          kind: "trusted-external-manager-update",
          manager: `${managerContract.name}@${managerContract.version}`,
          skill: exactSkillName,
          sourceIdentity,
          sourceDigest,
          candidateRevision: after.candidate.revision,
          candidateFolderHash: after.candidate.folderHash,
          installedFolderHash: after.installedFolderHash,
          lockFolderHash: after.entry.skillFolderHash,
          nativeTransactionGuarantee: false,
          acceptedExceptions: trustedExternalManagerExceptions,
        }],
      };
    },
  };
  return Object.freeze(provider);
}
