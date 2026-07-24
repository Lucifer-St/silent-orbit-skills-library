import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const trustedSkillsManagerContract = Object.freeze({
  name: "skills",
  version: "1.5.20",
  registryIntegrity: "sha512-lPl5KzMfTW+qwHFwc8t6R+wAqmdmSHw1+HWbGdJ/FZYbWLdB34bAZNFWiencM5DVoRaKAgXArmfTWMlNAbl9Gg==",
  cliSha256: "fa5c073b5666b2e096112ad34da80ec20500d1d7f0a32ced77f3eff785562528",
  packageJsonSha256: "6fde39f7b97401853bcdad4de1395411b9845b858497e1697bcb50b4ac9a1609",
});

export const phase5cDisposableMarker = ".silent-orbit-phase5c-disposable.json";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function contentId(prefix, value, length = 24) {
  return `${prefix}-${sha256(stableJson(value)).slice(0, length)}`;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${label} is missing or invalid.`);
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function isWithin(root, candidate, { allowRoot = false } = {}) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (allowRoot && relative === "") || (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRealDirectory(value, label) {
  invariant(typeof value === "string" && path.isAbsolute(value), `${label} must be an explicit absolute path.`);
  const resolved = path.resolve(value);
  const stats = fs.lstatSync(resolved, { throwIfNoEntry: false });
  invariant(stats?.isDirectory() && !stats.isSymbolicLink(), `${label} must be an existing real directory.`);
  return resolved;
}

function assertPortableSkillName(value, label = "Skill name") {
  invariant(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value), `${label} must be one exact portable Skill name.`);
  return value;
}

function assertNoSymlinkTree(root, relative = "") {
  const directory = relative ? path.join(root, ...relative.split("/")) : root;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const portable = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    const stats = fs.lstatSync(absolute);
    invariant(!stats.isSymbolicLink(), `Trusted source snapshot contains a symbolic link at ${portable}.`);
    if (stats.isDirectory()) assertNoSymlinkTree(root, portable);
    else invariant(stats.isFile(), `Trusted source snapshot contains an unsupported entry at ${portable}.`);
  }
}

export function computeSkillFolderHash(skillRoot) {
  const root = assertRealDirectory(skillRoot, "Skill folder");
  assertNoSymlinkTree(root);
  const files = [];
  function collect(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const portable = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(absolute, portable);
      else if (entry.isFile()) files.push({ path: portable, bytes: fs.readFileSync(absolute) });
      else throw new Error(`Skill folder contains an unsupported entry at ${portable}.`);
    }
  }
  collect(root);
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file.path);
    digest.update(file.bytes);
  }
  return digest.digest("hex");
}

export function verifyTrustedSkillsManager({ packageRoot, packageLockPath } = {}) {
  const root = assertRealDirectory(packageRoot, "Pinned skills package root");
  const packageJsonPath = path.join(root, "package.json");
  const cliEntry = path.join(root, "bin", "cli.mjs");
  const cliBundle = path.join(root, "dist", "cli.mjs");
  const packageJsonBytes = fs.readFileSync(packageJsonPath);
  const packageJson = JSON.parse(packageJsonBytes.toString("utf8"));
  invariant(
    packageJson.name === trustedSkillsManagerContract.name
      && packageJson.version === trustedSkillsManagerContract.version,
    "Pinned skills package identity does not match skills@1.5.20.",
  );
  invariant(sha256(packageJsonBytes) === trustedSkillsManagerContract.packageJsonSha256, "Pinned skills package metadata digest drifted.");
  invariant(fs.existsSync(cliEntry), "Pinned skills CLI entrypoint is missing.");
  invariant(sha256(fs.readFileSync(cliBundle)) === trustedSkillsManagerContract.cliSha256, "Pinned skills CLI bundle digest drifted.");

  if (packageLockPath) {
    const lock = readJson(path.resolve(packageLockPath), "npm package lock");
    const entry = lock.packages?.["node_modules/skills"];
    invariant(entry?.version === trustedSkillsManagerContract.version, "package-lock does not pin skills@1.5.20.");
    invariant(entry.integrity === trustedSkillsManagerContract.registryIntegrity, "package-lock skills integrity drifted.");
    invariant(entry.resolved === `https://registry.npmjs.org/skills/-/skills-${trustedSkillsManagerContract.version}.tgz`, "package-lock skills tarball URL drifted.");
  }

  return {
    ...trustedSkillsManagerContract,
    packageRoot: root,
    cliEntry,
  };
}

function lockPathFor(profileRoot, stateHome) {
  return stateHome
    ? path.join(path.resolve(stateHome), "skills", ".skill-lock.json")
    : path.join(path.resolve(profileRoot), ".agents", ".skill-lock.json");
}

function installedRootFor(profileRoot, name) {
  return path.join(path.resolve(profileRoot), ".agents", "skills", assertPortableSkillName(name));
}

function githubSourceIdentity(entry) {
  const source = String(entry?.source ?? "").trim();
  const sourceUrl = String(entry?.sourceUrl ?? "").trim();
  if (entry?.pluginName) return null;
  if (entry?.sourceType === "github" && /^[^/\s]+\/[^/\s]+$/.test(source)) return source;
  if (entry?.sourceType !== "git") return null;
  for (const candidate of [sourceUrl, source]) {
    try {
      const url = new URL(candidate);
      if (url.hostname.toLowerCase() === "github.com") return url.pathname.replace(/^\/|\/(?:\.git)?$/g, "").replace(/\.git$/i, "");
    } catch {
      // Generic shorthand is not trusted as a GitHub identity.
    }
  }
  return null;
}

function assertDisposableProfile(profileRoot) {
  const root = assertRealDirectory(profileRoot, "Disposable profile");
  invariant(isWithin(os.tmpdir(), root), "Disposable profile must remain beneath the operating-system temporary directory.");
  const marker = readJson(path.join(root, phase5cDisposableMarker), "Phase 5C disposable marker");
  invariant(marker.schemaVersion === 1 && marker.purpose === "silent-orbit-phase5c" && marker.disposable === true, "Disposable profile marker is invalid.");
  return root;
}

function inspectBatchState({ profileRoot, stateHome, skillNames, allowDisposableSource = false }) {
  const root = assertRealDirectory(profileRoot, "Skill profile");
  if (allowDisposableSource) assertDisposableProfile(root);
  const lockPath = lockPathFor(root, stateHome);
  const lockBytes = fs.readFileSync(lockPath);
  const lock = JSON.parse(lockBytes.toString("utf8"));
  invariant(Number.isInteger(lock.version) && lock.version >= 3 && lock.skills && typeof lock.skills === "object", "Global Skill lock is not a supported v3 lock.");

  const requestedNames = skillNames === undefined
    ? null
    : [...new Set([skillNames].flat().map((name) => assertPortableSkillName(name)))].sort((left, right) => left.localeCompare(right, "en"));
  const requestedSet = requestedNames ? new Set(requestedNames) : null;
  const entries = [];
  const unknownSources = [];
  const pluginEntries = [];
  const lockHashUnavailableEntries = [];
  const locallyDriftedEntries = [];

  for (const name of Object.keys(lock.skills).sort((left, right) => left.localeCompare(right, "en"))) {
    if (requestedSet && !requestedSet.has(name)) continue;
    assertPortableSkillName(name, "Locked Skill name");
    const entry = lock.skills[name];
    if (entry?.pluginName) {
      pluginEntries.push(name);
      continue;
    }
    const sourceIdentity = githubSourceIdentity(entry);
    if (!sourceIdentity && !allowDisposableSource) {
      unknownSources.push(name);
      continue;
    }
    invariant(typeof entry?.source === "string" && entry.source.length > 0, `Locked Skill ${name} is missing its source identity.`);
    invariant(typeof entry?.sourceType === "string" && entry.sourceType.length > 0, `Locked Skill ${name} is missing its source type.`);
    const installedRoot = installedRootFor(root, name);
    let folderSha256;
    try {
      folderSha256 = computeSkillFolderHash(installedRoot);
    } catch {
      locallyDriftedEntries.push(name);
      continue;
    }
    const lockHashAvailable = typeof entry?.skillPath === "string"
      && entry.skillPath.length > 0
      && typeof entry?.skillFolderHash === "string"
      && /^[0-9a-f]{64}$/i.test(entry.skillFolderHash);
    if (!lockHashAvailable) lockHashUnavailableEntries.push(name);
    if (lockHashAvailable && folderSha256 !== entry.skillFolderHash) {
      locallyDriftedEntries.push(name);
      continue;
    }
    entries.push({
      name,
      source: entry.source,
      sourceType: entry.sourceType,
      sourceUrl: entry.sourceUrl ?? null,
      sourceIdentity: sourceIdentity ?? `disposable:${entry.source}`,
      skillPath: entry.skillPath ?? null,
      lockFolderSha256: lockHashAvailable ? entry.skillFolderHash : null,
      folderSha256,
      lockHashAvailable,
      installedRoot,
    });
  }

  const missingNames = requestedNames?.filter((name) => !Object.hasOwn(lock.skills, name)) ?? [];
  return {
    profileRoot: root,
    stateHome: stateHome ? path.resolve(stateHome) : null,
    lockPath,
    lockSha256: sha256(lockBytes),
    entries,
    unknownSources,
    pluginEntries,
    lockHashUnavailableEntries,
    locallyDriftedEntries,
    missingNames,
  };
}

function planIdentityPayload(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    manager: plan.manager,
    profileMode: plan.profileMode,
    entries: plan.entries.map(({ installedRoot: _installedRoot, ...entry }) => entry),
    excluded: plan.excluded,
    limitations: plan.limitations,
    blockers: plan.blockers,
    recoveryPolicy: plan.recoveryPolicy,
  };
}

export function createTrustedSourceBatchPlanV1({
  packageRoot,
  packageLockPath,
  profileRoot,
  stateHome,
  privateRoot,
  skillNames,
  allowDisposableSource = false,
} = {}) {
  const manager = verifyTrustedSkillsManager({ packageRoot, packageLockPath });
  const profileMode = allowDisposableSource ? "disposable" : "real-global";
  const state = inspectBatchState({ profileRoot, stateHome, skillNames, allowDisposableSource });
  const blockers = [];
  if (state.missingNames.length) blockers.push(`missing:${state.missingNames.join(",")}`);
  if (state.unknownSources.length && skillNames !== undefined) blockers.push(`unknown-source:${state.unknownSources.join(",")}`);
  if (state.pluginEntries.length && skillNames !== undefined) blockers.push(`plugin-managed:${state.pluginEntries.join(",")}`);
  if (state.locallyDriftedEntries.length && skillNames !== undefined) blockers.push(`local-drift:${state.locallyDriftedEntries.join(",")}`);
  if (state.entries.length === 0) blockers.push("no-trusted-source-managed-skills");
  const transactionRoot = path.resolve(privateRoot);
  invariant(path.isAbsolute(transactionRoot), "Private maintenance root must be absolute.");
  invariant(
    !isWithin(path.join(state.profileRoot, ".agents", "skills"), transactionRoot, { allowRoot: true }),
    "Private maintenance root must stay outside the managed Skill folder.",
  );
  const managerStateRoot = state.stateHome
    ? path.join(state.stateHome, "skills")
    : path.join(state.profileRoot, ".agents");
  invariant(
    !isWithin(managerStateRoot, transactionRoot, { allowRoot: true }),
    "Private maintenance root must stay outside the manager lock state.",
  );

  const plan = {
    schemaVersion: 1,
    kind: "TrustedSourceBatchPlanV1",
    manager: {
      name: manager.name,
      version: manager.version,
      registryIntegrity: manager.registryIntegrity,
      cliSha256: manager.cliSha256,
      packageJsonSha256: manager.packageJsonSha256,
    },
    profileMode,
    entries: state.entries,
    excluded: {
      unknownSources: state.unknownSources,
      pluginManaged: state.pluginEntries,
      localDrift: state.locallyDriftedEntries,
      systemManaged: true,
      deletion: true,
    },
    limitations: {
      lockFolderHashUnavailable: state.lockHashUnavailableEntries,
    },
    blockers,
    executable: blockers.length === 0,
    recoveryPolicy: {
      snapshot: "names-sources-hashes-and-recoverable-contents",
      restore: "manager-or-verification-failure-only",
      nativeTransactionGuarantee: false,
    },
    privateRoot: transactionRoot,
    runtime: {
      packageRoot: manager.packageRoot,
      packageLockPath: packageLockPath ? path.resolve(packageLockPath) : null,
      profileRoot: state.profileRoot,
      stateHome: state.stateHome,
      lockPath: state.lockPath,
      lockSha256: state.lockSha256,
      allowDisposableSource,
    },
  };
  plan.batchId = contentId("trusted-source-batch", planIdentityPayload(plan));
  plan.confirmation = {
    scope: "one-reviewed-trusted-source-batch",
    token: `CONFIRM TRUSTED SOURCE BATCH ${plan.batchId}`,
  };
  return plan;
}

function validatePlan(plan) {
  invariant(plan?.kind === "TrustedSourceBatchPlanV1" && plan.schemaVersion === 1, "Trusted source batch plan is invalid.");
  invariant(plan.batchId === contentId("trusted-source-batch", planIdentityPayload(plan)), "Trusted source batch plan identity drifted.");
  invariant(plan.manager.name === trustedSkillsManagerContract.name && plan.manager.version === trustedSkillsManagerContract.version, "Trusted source plan manager identity drifted.");
  invariant(plan.manager.registryIntegrity === trustedSkillsManagerContract.registryIntegrity, "Trusted source plan manager integrity drifted.");
  invariant(plan.manager.cliSha256 === trustedSkillsManagerContract.cliSha256, "Trusted source plan CLI digest drifted.");
  invariant(plan.manager.packageJsonSha256 === trustedSkillsManagerContract.packageJsonSha256, "Trusted source plan package metadata digest drifted.");
  invariant(Array.isArray(plan.entries) && plan.entries.length > 0, "Trusted source batch has no entries.");
  for (const entry of plan.entries) assertPortableSkillName(entry.name);
  return plan;
}

function copyTree(source, target, relative = "") {
  const sourceDirectory = relative ? path.join(source, ...relative.split("/")) : source;
  fs.mkdirSync(relative ? path.join(target, ...relative.split("/")) : target, { recursive: true });
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const portable = relative ? `${relative}/${entry.name}` : entry.name;
    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(target, ...portable.split("/"));
    const stats = fs.lstatSync(sourcePath);
    invariant(!stats.isSymbolicLink(), `Recovery snapshot contains a symbolic link at ${portable}.`);
    if (stats.isDirectory()) copyTree(source, target, portable);
    else if (stats.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    } else throw new Error(`Recovery snapshot contains an unsupported entry at ${portable}.`);
  }
}

function createRecoverySnapshot(plan, now) {
  const baseId = `${String(now).replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "")}-${plan.batchId}`;
  let transactionDirectory = path.join(plan.privateRoot, "trusted-source-maintenance", baseId);
  let suffix = 2;
  while (fs.existsSync(transactionDirectory)) transactionDirectory = path.join(plan.privateRoot, "trusted-source-maintenance", `${baseId}-${suffix++}`);
  fs.mkdirSync(transactionDirectory, { recursive: true });
  const lockBackup = path.join(transactionDirectory, "skill-lock.before.json");
  fs.copyFileSync(plan.runtime.lockPath, lockBackup);
  const entries = plan.entries.map((entry, index) => {
    const backupRelative = `contents/${String(index + 1).padStart(3, "0")}-${entry.name}`;
    const backupRoot = path.join(transactionDirectory, ...backupRelative.split("/"));
    copyTree(entry.installedRoot, backupRoot);
    return {
      name: entry.name,
      source: entry.source,
      sourceType: entry.sourceType,
      sourceIdentity: entry.sourceIdentity,
      installedRoot: entry.installedRoot,
      beforeFolderSha256: entry.folderSha256,
      backupRelative,
    };
  });
  const manifest = {
    schemaVersion: 1,
    kind: "TrustedSourceRecoverySnapshotV1",
    batchId: plan.batchId,
    createdAt: now,
    manager: plan.manager,
    profileRoot: plan.runtime.profileRoot,
    stateHome: plan.runtime.stateHome,
    lockPath: plan.runtime.lockPath,
    beforeLockSha256: plan.runtime.lockSha256,
    lockBackup: path.basename(lockBackup),
    entries,
    status: "ready",
  };
  writeJsonAtomic(path.join(transactionDirectory, "snapshot.json"), manifest);
  return { transactionDirectory, manifest };
}

function restoreRecoverySnapshot(snapshot) {
  const { transactionDirectory, manifest } = snapshot;
  const canonicalRoot = path.join(manifest.profileRoot, ".agents", "skills");
  for (const entry of manifest.entries) {
    invariant(isWithin(canonicalRoot, entry.installedRoot), `Recovery target for ${entry.name} escaped the canonical Skill root.`);
    const backupRoot = path.join(transactionDirectory, ...entry.backupRelative.split("/"));
    invariant(computeSkillFolderHash(backupRoot) === entry.beforeFolderSha256, `Recovery backup for ${entry.name} drifted.`);
    fs.rmSync(entry.installedRoot, { recursive: true, force: true });
    copyTree(backupRoot, entry.installedRoot);
  }
  fs.copyFileSync(path.join(transactionDirectory, manifest.lockBackup), manifest.lockPath);
  invariant(sha256(fs.readFileSync(manifest.lockPath)) === manifest.beforeLockSha256, "Recovered global Skill lock digest does not match the before snapshot.");
  for (const entry of manifest.entries) {
    invariant(computeSkillFolderHash(entry.installedRoot) === entry.beforeFolderSha256, `Recovered Skill ${entry.name} digest does not match the before snapshot.`);
  }
  manifest.status = "restored";
  writeJsonAtomic(path.join(transactionDirectory, "snapshot.json"), manifest);
}

function diffEntries(beforeEntries, afterEntries) {
  const before = new Map(beforeEntries.map((entry) => [entry.name, entry]));
  const after = new Map(afterEntries.map((entry) => [entry.name, entry]));
  const names = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) => left.localeCompare(right, "en"));
  const changed = [];
  const added = [];
  const missing = [];
  const sourceChanged = [];
  for (const name of names) {
    const left = before.get(name);
    const right = after.get(name);
    if (!left) {
      added.push(name);
      continue;
    }
    if (!right) {
      missing.push(name);
      continue;
    }
    if (left.source !== right.source || left.sourceType !== right.sourceType || left.sourceIdentity !== right.sourceIdentity) {
      sourceChanged.push(name);
    }
    if (left.folderSha256 !== right.folderSha256) {
      changed.push({
        name,
        sourceIdentity: right.sourceIdentity,
        beforeSha256: left.folderSha256,
        afterSha256: right.folderSha256,
      });
    }
  }
  return { changed, added, missing, sourceChanged };
}

function defaultManagerRunner({ plan }) {
  const manager = verifyTrustedSkillsManager({
    packageRoot: plan.runtime.packageRoot,
    packageLockPath: plan.runtime.packageLockPath,
  });
  const env = {
    ...process.env,
    USERPROFILE: plan.runtime.profileRoot,
    HOME: plan.runtime.profileRoot,
    DISABLE_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
    NO_COLOR: "1",
  };
  if (plan.runtime.stateHome) env.XDG_STATE_HOME = plan.runtime.stateHome;
  const args = [manager.cliEntry, "check", ...plan.entries.map((entry) => entry.name), "-g", "-y"];
  const result = spawnSync(process.execPath, args, {
    cwd: plan.runtime.profileRoot,
    env,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
    command: ["skills@1.5.20", "check", ...plan.entries.map((entry) => entry.name), "-g", "-y"],
  };
}

function persistReceipt(snapshot, receipt) {
  writeJsonAtomic(path.join(snapshot.transactionDirectory, "receipt.json"), receipt);
}

export function executeTrustedSourceBatchV1({
  plan: rawPlan,
  confirmation,
  managerRunner = defaultManagerRunner,
  rescan,
  synchronize,
  clock = () => new Date().toISOString(),
} = {}) {
  const plan = validatePlan(rawPlan);
  invariant(plan.executable === true && plan.blockers.length === 0, `Trusted source batch is blocked: ${plan.blockers.join("; ")}`);
  invariant(confirmation === plan.confirmation.token, "Trusted source batch confirmation did not match the reviewed batch.");
  invariant(typeof managerRunner === "function", "Trusted source batch requires a manager runner.");
  invariant(typeof rescan === "function", "Trusted source batch requires a Core-observed rescan callback.");
  invariant(typeof synchronize === "function", "Trusted source batch requires an atomic Library synchronization callback.");

  verifyTrustedSkillsManager({ packageRoot: plan.runtime.packageRoot, packageLockPath: plan.runtime.packageLockPath });
  const freshBefore = inspectBatchState({
    profileRoot: plan.runtime.profileRoot,
    stateHome: plan.runtime.stateHome,
    skillNames: plan.entries.map((entry) => entry.name),
    allowDisposableSource: plan.runtime.allowDisposableSource,
  });
  invariant(freshBefore.lockSha256 === plan.runtime.lockSha256, "Global Skill lock drifted after batch review.");
  for (const reviewed of plan.entries) {
    const fresh = freshBefore.entries.find((entry) => entry.name === reviewed.name);
    invariant(fresh?.folderSha256 === reviewed.folderSha256, `Skill ${reviewed.name} drifted after batch review.`);
    invariant(fresh?.source === reviewed.source && fresh?.sourceType === reviewed.sourceType, `Skill ${reviewed.name} source drifted after batch review.`);
  }

  const startedAt = clock();
  const snapshot = createRecoverySnapshot(plan, startedAt);
  let managerResult = null;
  let after = null;
  let diff = null;
  let rescanResult = null;
  let synchronization = null;
  try {
    managerResult = managerRunner({ plan, snapshot });
    invariant(managerResult && Number.isInteger(managerResult.status), "Trusted skills manager did not return an exit status.");
    invariant(managerResult.status === 0, "Trusted skills manager check-and-update failed.");
    after = inspectBatchState({
      profileRoot: plan.runtime.profileRoot,
      stateHome: plan.runtime.stateHome,
      skillNames: plan.entries.map((entry) => entry.name),
      allowDisposableSource: plan.runtime.allowDisposableSource,
    });
    diff = diffEntries(plan.entries, after.entries);
    invariant(diff.added.length === 0, `Trusted batch unexpectedly added Skills: ${diff.added.join(", ")}.`);
    invariant(diff.missing.length === 0, `Trusted batch unexpectedly removed Skills: ${diff.missing.join(", ")}.`);
    invariant(diff.sourceChanged.length === 0, `Trusted batch changed source identities: ${diff.sourceChanged.join(", ")}.`);
    rescanResult = rescan({ plan, before: freshBefore, after, diff, snapshot, managerResult });
    invariant(rescanResult && rescanResult.ok !== false, "Post-manager Skill rescan failed.");
    synchronization = synchronize({ plan, before: freshBefore, after, diff, snapshot, managerResult, rescan: rescanResult });
    invariant(synchronization?.verification?.ok === true, "Post-manager Library/Obsidian synchronization or verification failed.");
    const finalState = inspectBatchState({
      profileRoot: plan.runtime.profileRoot,
      stateHome: plan.runtime.stateHome,
      skillNames: plan.entries.map((entry) => entry.name),
      allowDisposableSource: plan.runtime.allowDisposableSource,
    });
    invariant(stableJson(diffEntries(after.entries, finalState.entries)) === stableJson({ changed: [], added: [], missing: [], sourceChanged: [] }), "Trusted Skill content drifted during synchronization.");
    snapshot.manifest.status = "retained-for-recovery";
    writeJsonAtomic(path.join(snapshot.transactionDirectory, "snapshot.json"), snapshot.manifest);
    const receipt = {
      schemaVersion: 1,
      kind: "TrustedSourceMaintenanceReceiptV1",
      batchId: plan.batchId,
      status: "succeeded",
      startedAt,
      completedAt: clock(),
      manager: plan.manager,
      nativeTransactionGuarantee: false,
      managerResult,
      diff,
      recovery: {
        policy: "failure-only",
        snapshotStatus: snapshot.manifest.status,
        available: true,
        restored: false,
      },
      rescan: rescanResult,
      synchronization,
    };
    receipt.receiptId = contentId("trusted-source-receipt", receipt);
    persistReceipt(snapshot, receipt);
    return receipt;
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    let recoveryError = null;
    try {
      restoreRecoverySnapshot(snapshot);
    } catch (restoreError) {
      recoveryError = restoreError instanceof Error ? restoreError.message : String(restoreError);
    }
    const receipt = {
      schemaVersion: 1,
      kind: "TrustedSourceMaintenanceReceiptV1",
      batchId: plan.batchId,
      status: recoveryError ? "rollback-failed" : "rolled-back",
      startedAt,
      completedAt: clock(),
      manager: plan.manager,
      nativeTransactionGuarantee: false,
      managerResult,
      diff,
      failure,
      recovery: {
        policy: "failure-only",
        snapshotStatus: snapshot.manifest.status,
        available: true,
        restored: recoveryError === null,
        error: recoveryError,
      },
      rescan: rescanResult,
      synchronization,
    };
    receipt.receiptId = contentId("trusted-source-receipt", receipt);
    persistReceipt(snapshot, receipt);
    return receipt;
  }
}
