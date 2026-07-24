import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createManagementPlanV1,
  createProviderCapabilityV1,
  executeManagementPlanV1,
  managementOperations,
  trustedExternalManagerExceptions,
} from "../lib/skill-management.mjs";
import {
  createNpxSkillsSourceManagedProvider,
  npxSkillsSourceManagedEvaluation,
  npxSkillsSourceManagedProviderId,
  phase5bDisposableMarker,
} from "../lib/npx-skills-source-managed-evaluation.mjs";

const FIXED_TIME = "2026-07-24T12:00:00.000Z";
const SKILL_NAME = "example-skill";
const PACKAGE_ROOT = fileURLToPath(new URL("../../node_modules/skills/", import.meta.url));

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function folderHash(root) {
  const files = [];
  function collect(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const portable = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(absolute, portable);
      else if (entry.isFile()) files.push({ path: portable, bytes: fs.readFileSync(absolute) });
      else throw new Error(`Unsupported fixture entry ${portable}.`);
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

function treeSnapshot(root, relative = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      const portable = next.split(path.sep).join("/");
      if (entry.isDirectory()) return [{ path: `${portable}/`, bytes: null }, ...treeSnapshot(root, next)];
      return [{ path: portable, bytes: fs.readFileSync(path.join(root, next)).toString("base64") }];
    });
}

function commitCandidate(candidateRoot) {
  execFileSync("git", ["init", "-q"], { cwd: candidateRoot, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: candidateRoot, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.name=Silent Orbit Tests", "-c", "user.email=tests@invalid", "commit", "-q", "-m", "candidate"],
    { cwd: candidateRoot, stdio: "ignore" },
  );
}

function createFixture(label, { current = "v1", candidate = "v2" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-phase5b-${label}-`));
  const allowedRoot = path.join(root, "allowed");
  const profileRoot = path.join(allowedRoot, "profiles", "disposable");
  const candidateRoot = path.join(root, "candidate");
  const transactionRoot = path.join(root, "transactions");
  const installedRoot = path.join(profileRoot, ".agents", "skills", SKILL_NAME);
  for (const relative of [".codex", ".state", ".tmp", ".appdata", ".localappdata", ".config"]) {
    fs.mkdirSync(path.join(profileRoot, relative), { recursive: true });
  }
  writeJson(path.join(profileRoot, phase5bDisposableMarker), {
    schemaVersion: 1,
    purpose: "silent-orbit-phase5b",
    disposable: true,
  });
  writeFile(path.join(installedRoot, "SKILL.md"), `---\nname: ${SKILL_NAME}\n---\n${current}\n`);
  writeFile(path.join(installedRoot, "version.txt"), `${current}\n`);
  fs.mkdirSync(candidateRoot, { recursive: true });
  writeFile(path.join(candidateRoot, "SKILL.md"), `---\nname: ${SKILL_NAME}\n---\n${candidate}\n`);
  writeFile(path.join(candidateRoot, "version.txt"), `${candidate}\n`);
  commitCandidate(candidateRoot);
  const expectedSource = candidateRoot;
  writeJson(path.join(profileRoot, ".state", "skills", ".skill-lock.json"), {
    version: 3,
    skills: {
      [SKILL_NAME]: {
        source: expectedSource,
        sourceType: "git",
        computedHash: "fixture",
        skillFolderHash: folderHash(installedRoot),
        installedAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
      },
    },
  });

  function request(relativePath = "profiles/disposable", operation = "update") {
    return {
      providerId: npxSkillsSourceManagedProviderId,
      providerKind: "source-managed",
      providerLabel: "npx skills source-managed Codex global Skill",
      operation,
      targets: [{
        id: "disposable-profile",
        rootId: "disposable-agent-root",
        relativePath,
      }],
      parameters: {
        skill: SKILL_NAME,
        scope: "global",
        sourceIdentity: "local/example-skill",
        managerVersion: "1.5.20",
      },
    };
  }

  function provider(managerRunner) {
    return createNpxSkillsSourceManagedProvider({
      packageRoot: PACKAGE_ROOT,
      profileRoot,
      candidateRoot,
      skillName: SKILL_NAME,
      expectedSource,
      expectedSourceType: "git",
      sourceIdentity: "local/example-skill",
      managerRunner,
    });
  }

  function updateLock(hash) {
    const lockPath = path.join(profileRoot, ".state", "skills", ".skill-lock.json");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    lock.skills[SKILL_NAME].skillFolderHash = hash;
    lock.skills[SKILL_NAME].updatedAt = "2026-07-24T12:01:00.000Z";
    writeJson(lockPath, lock);
  }

  function applyCandidate() {
    fs.rmSync(installedRoot, { recursive: true, force: true });
    fs.mkdirSync(installedRoot, { recursive: true });
    for (const file of ["SKILL.md", "version.txt"]) {
      fs.copyFileSync(path.join(candidateRoot, file), path.join(installedRoot, file));
    }
    updateLock(folderHash(candidateRoot));
  }

  return {
    root,
    allowedRoot,
    allowedRoots: { "disposable-agent-root": allowedRoot },
    profileRoot,
    candidateRoot,
    expectedSource,
    installedRoot,
    transactionRoot,
    request,
    provider,
    updateLock,
    applyCandidate,
  };
}

test("skills 1.5.20 evaluation is deterministic, sanitized, and discloses the accepted native exceptions", () => {
  assert.equal(npxSkillsSourceManagedEvaluation.decision, "go");
  assert.equal(npxSkillsSourceManagedEvaluation.operation, "update");
  assert.equal(npxSkillsSourceManagedEvaluation.scope, "host-injected-disposable-codex-profile-only");
  assert.equal(npxSkillsSourceManagedEvaluation.manager.version, "1.5.20");
  assert.equal(npxSkillsSourceManagedEvaluation.nativeTransactionGuarantee, false);
  assert.deepEqual(npxSkillsSourceManagedEvaluation.acceptedExceptions, trustedExternalManagerExceptions);
  assert.deepEqual(npxSkillsSourceManagedEvaluation.otherOperations, {
    install: "unknown",
    freeze: "unknown",
    remove: "unknown",
    restore: "unknown",
  });
  const serialized = JSON.stringify(npxSkillsSourceManagedEvaluation);
  assert.doesNotMatch(serialized, /(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/)/);
  assert.doesNotMatch(serialized, /receiptId|transactionRoot|allowedRoots/);
  assert.equal(Object.isFrozen(npxSkillsSourceManagedEvaluation), true);
});

test("only exact update is supported; every other operation stays unknown and read-only", (t) => {
  const setup = createFixture("capabilities");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const provider = setup.provider(() => ({ status: 0 }));
  assert.equal(provider.capability.readOnly, false);
  for (const operation of managementOperations) {
    const expected = operation === "update" ? "supported" : "unknown";
    assert.equal(provider.capability.operations[operation].state, expected);
    assert.equal(provider.capability.operations[operation].access, operation === "update" ? "guarded" : "read-only");
    assert.equal(provider.probeCapability({ operation }).state, expected);
  }
  assert.equal(provider.capability.operations.update.evidenceIds.length, 1);
  assert.equal(provider.capability.evidence[0].kind, "trusted-external-contract");
  assert.equal(provider.execution.nativeTransactionGuarantee, false);
  assert.deepEqual(provider.execution.exceptions, trustedExternalManagerExceptions);
});

test("the Provider refuses ambient home roots, candidate traversal, and Plugin lock entries", (t) => {
  const setup = createFixture("binding-guards");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const options = {
    packageRoot: PACKAGE_ROOT,
    candidateRoot: setup.candidateRoot,
    skillName: SKILL_NAME,
    expectedSource: setup.expectedSource,
    expectedSourceType: "git",
    sourceIdentity: "local/example-skill",
    managerRunner: () => ({ status: 0 }),
  };
  assert.throws(
    () => createNpxSkillsSourceManagedProvider({ ...options, profileRoot: os.homedir() }),
    /real home directory/,
  );
  assert.throws(
    () => createNpxSkillsSourceManagedProvider({
      ...options,
      profileRoot: setup.profileRoot,
      candidateSkillRelativePath: "../escape",
    }),
    /must stay inside/,
  );
  const lockPath = path.join(setup.profileRoot, ".state", "skills", ".skill-lock.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.skills[SKILL_NAME].pluginName = "forbidden-plugin";
  writeJson(lockPath, lock);
  const provider = setup.provider(() => ({ status: 0 }));
  assert.throws(
    () => createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots }),
    /Plugin-provided Skills are outside/,
  );
});

test("one exact update produces the same sanitized plan for Windows and POSIX paths", (t) => {
  const setup = createFixture("deterministic");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const provider = setup.provider(() => ({ status: 0 }));
  const posix = createManagementPlanV1({
    provider,
    request: setup.request("profiles/disposable"),
    allowedRoots: setup.allowedRoots,
  });
  const windows = createManagementPlanV1({
    provider,
    request: setup.request("profiles\\disposable"),
    allowedRoots: setup.allowedRoots,
  });
  assert.deepEqual(posix, windows);
  assert.equal(posix.executable, true);
  assert.equal(posix.capability.state, "supported");
  assert.equal(posix.execution.mode, "trusted-external-manager");
  assert.equal(posix.execution.nativeTransactionGuarantee, false);
  assert.deepEqual(posix.execution.exceptions, trustedExternalManagerExceptions);
  assert.deepEqual(posix.changes, []);
  assert.equal(posix.impact.managerOwnedMutation, true);
  assert.equal(posix.targets[0].relativePath, "profiles/disposable");
  assert.equal(posix.targets[0].expectedAfterDigest, "provider-verified");
  assert.doesNotMatch(JSON.stringify(posix), new RegExp(setup.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("dry-run returns a complete external-manager receipt with zero writes or manager calls", (t) => {
  const setup = createFixture("dry-run");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  let calls = 0;
  const provider = setup.provider(() => {
    calls += 1;
    return { status: 0 };
  });
  const plan = createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots });
  const before = treeSnapshot(setup.profileRoot);
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    dryRun: true,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "dry-run");
  assert.equal(receipt.execution.mode, "trusted-external-manager");
  assert.equal(receipt.execution.nativeTransactionGuarantee, false);
  assert.equal(calls, 0);
  assert.deepEqual(treeSnapshot(setup.profileRoot), before);
  assert.equal(fs.existsSync(setup.transactionRoot), false);
});

test("no-update becomes a deterministic blocked plan and never calls the manager", (t) => {
  const setup = createFixture("no-update", { current: "v2", candidate: "v2" });
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  let calls = 0;
  const provider = setup.provider(() => {
    calls += 1;
    return { status: 0 };
  });
  const plan = createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots });
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.blockers, ["no-update"]);
  assert.equal(plan.targets[0].expectedAfterDigest, plan.targets[0].expectedDigest);
  const before = treeSnapshot(setup.profileRoot);
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.errors[0].code, "no-update");
  assert.equal(calls, 0);
  assert.deepEqual(treeSnapshot(setup.profileRoot), before);
  assert.equal(fs.existsSync(setup.transactionRoot), false);
});

test("a valid exact update is applied by the manager and verified against candidate plus lock hashes", (t) => {
  const setup = createFixture("valid-update");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  let calls = 0;
  const provider = setup.provider(() => {
    calls += 1;
    setup.applyCandidate();
    return { status: 0 };
  });
  const plan = createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots });
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.execution.nativeTransactionGuarantee, false);
  assert.deepEqual(receipt.execution.exceptions, trustedExternalManagerExceptions);
  assert.equal(receipt.verification.status, "passed");
  assert.equal(receipt.verification.evidence[0].candidateFolderHash, folderHash(setup.candidateRoot));
  assert.equal(receipt.verification.evidence[0].installedFolderHash, folderHash(setup.installedRoot));
  assert.equal(receipt.verification.evidence[0].nativeTransactionGuarantee, false);
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(path.join(setup.installedRoot, "version.txt"), "utf8"), "v2\n");
});

test("source mismatch and target drift stop before manager mutation", (t) => {
  const sourceMismatch = createFixture("source-mismatch");
  const drift = createFixture("target-drift");
  t.after(() => {
    fs.rmSync(sourceMismatch.root, { recursive: true, force: true });
    fs.rmSync(drift.root, { recursive: true, force: true });
  });
  let sourceCalls = 0;
  const sourceProvider = sourceMismatch.provider(() => {
    sourceCalls += 1;
    return { status: 0 };
  });
  const lockPath = path.join(sourceMismatch.profileRoot, ".state", "skills", ".skill-lock.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.skills[SKILL_NAME].source = "different/source";
  writeJson(lockPath, lock);
  assert.throws(
    () => createManagementPlanV1({ provider: sourceProvider, request: sourceMismatch.request(), allowedRoots: sourceMismatch.allowedRoots }),
    /source mismatch/,
  );
  assert.equal(sourceCalls, 0);

  let driftCalls = 0;
  const driftProvider = drift.provider(() => {
    driftCalls += 1;
    return { status: 0 };
  });
  const plan = createManagementPlanV1({ provider: driftProvider, request: drift.request(), allowedRoots: drift.allowedRoots });
  writeFile(path.join(drift.profileRoot, ".codex", "drift.txt"), "drift\n");
  const receipt = executeManagementPlanV1({
    plan,
    provider: driftProvider,
    allowedRoots: drift.allowedRoots,
    transactionRoot: drift.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.errors[0].code, "target-digest-drift");
  assert.equal(driftCalls, 0);
  assert.equal(fs.existsSync(drift.transactionRoot), false);
});

test("manager partial failure, rescan failure, and verify failure restore the exact profile digest", (t) => {
  const cases = [
    {
      label: "partial",
      manager(setup) {
        writeFile(path.join(setup.installedRoot, "SKILL.md"), "partial\n");
        return { status: 1 };
      },
    },
    {
      label: "rescan",
      manager(setup) {
        setup.applyCandidate();
        return { status: 0 };
      },
      faultInjector(event) {
        if (event === "transaction:before-rescan") throw new Error("Injected rescan failure.");
      },
    },
    {
      label: "verify",
      manager(setup) {
        writeFile(path.join(setup.installedRoot, "SKILL.md"), "wrong-result\n");
        setup.updateLock(folderHash(setup.installedRoot));
        return { status: 0 };
      },
    },
  ];
  const fixtures = [];
  t.after(() => fixtures.forEach((setup) => fs.rmSync(setup.root, { recursive: true, force: true })));
  for (const scenario of cases) {
    const setup = createFixture(scenario.label);
    fixtures.push(setup);
    const provider = setup.provider(() => scenario.manager(setup));
    const plan = createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots });
    const before = treeSnapshot(setup.profileRoot);
    const receipt = executeManagementPlanV1({
      plan,
      provider,
      allowedRoots: setup.allowedRoots,
      transactionRoot: setup.transactionRoot,
      confirmation: plan.confirmation.token,
      clock: () => FIXED_TIME,
      faultInjector: scenario.faultInjector,
    });
    assert.equal(receipt.status, "rolled-back", scenario.label);
    assert.equal(receipt.rollback.status, "succeeded", scenario.label);
    assert.equal(receipt.rollback.restored[0].digest, plan.targets[0].expectedDigest, scenario.label);
    assert.deepEqual(treeSnapshot(setup.profileRoot), before, scenario.label);
    const replanned = createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots });
    assert.equal(replanned.targets[0].expectedDigest, plan.targets[0].expectedDigest, scenario.label);
  }
});

test("rollback failure is explicit and cannot be represented as a successful native update", (t) => {
  const setup = createFixture("rollback-failed");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const provider = setup.provider(() => {
    writeFile(path.join(setup.installedRoot, "SKILL.md"), "partial\n");
    return { status: 1 };
  });
  const plan = createManagementPlanV1({ provider, request: setup.request(), allowedRoots: setup.allowedRoots });
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
    faultInjector(event) {
      if (event === "rollback:before-target") throw new Error("Injected rollback failure.");
    },
  });
  assert.equal(receipt.status, "rollback-failed");
  assert.equal(receipt.rollback.status, "failed");
  assert.equal(receipt.execution.nativeTransactionGuarantee, false);
  assert.ok(receipt.errors.some((entry) => entry.code === "rollback-failed"));
  assert.notEqual(receipt.status, "succeeded");
});

test("unknown operations and an unsupported capability clone always produce zero writes", (t) => {
  const setup = createFixture("read-only");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  let calls = 0;
  const provider = setup.provider(() => {
    calls += 1;
    return { status: 0 };
  });
  const before = treeSnapshot(setup.profileRoot);
  for (const operation of ["install", "freeze", "remove", "restore"]) {
    const plan = createManagementPlanV1({
      provider,
      request: setup.request("profiles/disposable", operation),
      allowedRoots: setup.allowedRoots,
    });
    assert.equal(plan.executable, false);
    assert.deepEqual(plan.blockers, ["capability-unknown"]);
    const receipt = executeManagementPlanV1({
      plan,
      provider,
      allowedRoots: setup.allowedRoots,
      transactionRoot: path.join(setup.root, `transactions-${operation}`),
      confirmation: plan.confirmation.token,
      clock: () => FIXED_TIME,
    });
    assert.equal(receipt.status, "blocked");
    assert.equal(fs.existsSync(path.join(setup.root, `transactions-${operation}`)), false);
  }
  const unsupportedCapability = createProviderCapabilityV1({
    providerId: provider.id,
    providerKind: provider.kind,
    label: provider.label,
    operations: {
      update: {
        state: "unsupported",
        evidenceIds: provider.capability.operations.update.evidenceIds,
      },
    },
    evidence: provider.capability.evidence,
  });
  const unsupported = {
    ...provider,
    capability: unsupportedCapability,
  };
  const unsupportedPlan = createManagementPlanV1({
    provider: unsupported,
    request: setup.request(),
    allowedRoots: setup.allowedRoots,
  });
  assert.equal(unsupportedPlan.executable, false);
  assert.deepEqual(unsupportedPlan.blockers, ["capability-unsupported"]);
  const unsupportedReceipt = executeManagementPlanV1({
    plan: unsupportedPlan,
    provider: unsupported,
    allowedRoots: setup.allowedRoots,
    transactionRoot: path.join(setup.root, "transactions-unsupported"),
    confirmation: unsupportedPlan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(unsupportedReceipt.status, "blocked");
  assert.equal(fs.existsSync(path.join(setup.root, "transactions-unsupported")), false);
  assert.equal(calls, 0);
  assert.deepEqual(treeSnapshot(setup.profileRoot), before);
});
