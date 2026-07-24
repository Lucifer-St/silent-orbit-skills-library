import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runSilentOrbitCli } from "../silent-orbit.mjs";
import {
  computeSkillFolderHash,
  createTrustedSourceBatchPlanV1,
  executeTrustedSourceBatchV1,
  phase5cDisposableMarker,
  trustedSkillsManagerContract,
  verifyTrustedSkillsManager,
} from "../lib/trusted-source-maintenance.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = path.join(projectRoot, "node_modules", "skills");
const packageLockPath = path.join(projectRoot, "package-lock.json");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(label, { sourceType = "git", source = "http://127.0.0.1/disposable.git", disposable = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-phase5c-core-${label}-`));
  const profileRoot = path.join(root, "profile");
  const stateHome = path.join(profileRoot, ".state");
  const privateRoot = path.join(root, "private");
  const skillName = "phase5c-core-fixture";
  const skillRoot = path.join(profileRoot, ".agents", "skills", skillName);
  writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skillName}\ndescription: Core fixture.\n---\nversion one\n`);
  writeFile(path.join(skillRoot, "version.txt"), "v1\n");
  if (disposable) {
    writeJson(path.join(profileRoot, phase5cDisposableMarker), {
      schemaVersion: 1,
      purpose: "silent-orbit-phase5c",
      disposable: true,
    });
  }
  const lockPath = path.join(stateHome, "skills", ".skill-lock.json");
  writeJson(lockPath, {
    version: 3,
    skills: {
      [skillName]: {
        source,
        sourceType,
        sourceUrl: source,
        skillPath: "SKILL.md",
        skillFolderHash: computeSkillFolderHash(skillRoot),
        agents: ["codex"],
      },
    },
  });
  return { root, profileRoot, stateHome, privateRoot, skillName, skillRoot, lockPath };
}

function planFor(setup, extra = {}) {
  return createTrustedSourceBatchPlanV1({
    packageRoot,
    packageLockPath,
    profileRoot: setup.profileRoot,
    stateHome: setup.stateHome,
    privateRoot: setup.privateRoot,
    skillNames: [setup.skillName],
    allowDisposableSource: true,
    ...extra,
  });
}

function applyVersionTwo(setup) {
  writeFile(path.join(setup.skillRoot, "SKILL.md"), `---\nname: ${setup.skillName}\ndescription: Core fixture updated.\n---\nversion two\n`);
  writeFile(path.join(setup.skillRoot, "version.txt"), "v2\n");
  const lock = JSON.parse(fs.readFileSync(setup.lockPath, "utf8"));
  lock.skills[setup.skillName].skillFolderHash = computeSkillFolderHash(setup.skillRoot);
  lock.skills[setup.skillName].updatedAt = "2026-07-24T18:00:00.000Z";
  writeJson(setup.lockPath, lock);
}

test("skills@1.5.20 is content-addressed by package lock, metadata, and CLI bundle", () => {
  const manager = verifyTrustedSkillsManager({ packageRoot, packageLockPath });
  assert.equal(manager.version, "1.5.20");
  assert.equal(manager.registryIntegrity, trustedSkillsManagerContract.registryIntegrity);
  assert.equal(manager.packageJsonSha256, trustedSkillsManagerContract.packageJsonSha256);
  assert.equal(manager.cliSha256, trustedSkillsManagerContract.cliSha256);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-phase5c-lock-drift-"));
  const driftedLock = path.join(root, "package-lock.json");
  writeJson(driftedLock, {
    packages: {
      "node_modules/skills": {
        version: "1.5.21",
        resolved: "https://registry.npmjs.org/skills/-/skills-1.5.21.tgz",
        integrity: "sha512-drift",
      },
    },
  });
  assert.throws(() => verifyTrustedSkillsManager({ packageRoot, packageLockPath: driftedLock }), /does not pin skills@1\.5\.20/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("one reviewed disposable batch succeeds and retains lightweight recovery evidence", (t) => {
  const setup = fixture("success");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const plan = planFor(setup);
  assert.equal(plan.executable, true);
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.recoveryPolicy.nativeTransactionGuarantee, false);

  const receipt = executeTrustedSourceBatchV1({
    plan,
    confirmation: plan.confirmation.token,
    managerRunner: () => {
      applyVersionTwo(setup);
      return { status: 0, stdout: "Updated 1 skill(s)\n", stderr: "" };
    },
    rescan: ({ diff }) => ({ ok: true, changed: diff.changed.map((item) => item.name) }),
    synchronize: () => ({ verification: { ok: true }, obsidianSynchronized: true }),
    clock: () => "2026-07-24T18:00:00.000Z",
  });

  assert.equal(receipt.status, "succeeded");
  assert.deepEqual(receipt.diff.changed.map((item) => item.name), [setup.skillName]);
  assert.equal(receipt.recovery.snapshotStatus, "retained-for-recovery");
  assert.equal(receipt.recovery.restored, false);
  assert.equal(fs.readFileSync(path.join(setup.skillRoot, "version.txt"), "utf8"), "v2\n");
  const transactions = fs.readdirSync(path.join(setup.privateRoot, "trusted-source-maintenance"));
  assert.equal(transactions.length, 1);
  const transactionRoot = path.join(setup.privateRoot, "trusted-source-maintenance", transactions[0]);
  assert.equal(fs.existsSync(path.join(transactionRoot, "snapshot.json")), true);
  assert.equal(fs.existsSync(path.join(transactionRoot, "skill-lock.before.json")), true);
  assert.equal(fs.existsSync(path.join(transactionRoot, "contents", `001-${setup.skillName}`, "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(transactionRoot, "receipt.json")), true);
});

test("manager and verification failures restore exact Skill content plus lock bytes", (t) => {
  for (const scenario of ["manager", "verification"]) {
    const setup = fixture(scenario);
    t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
    const beforeLock = fs.readFileSync(setup.lockPath);
    const beforeHash = computeSkillFolderHash(setup.skillRoot);
    const plan = planFor(setup);
    const receipt = executeTrustedSourceBatchV1({
      plan,
      confirmation: plan.confirmation.token,
      managerRunner: () => {
        applyVersionTwo(setup);
        return { status: scenario === "manager" ? 1 : 0, stdout: "", stderr: scenario };
      },
      rescan: () => ({ ok: true }),
      synchronize: () => ({ verification: { ok: scenario !== "verification" } }),
      clock: () => "2026-07-24T18:01:00.000Z",
    });
    assert.equal(receipt.status, "rolled-back");
    assert.equal(receipt.recovery.restored, true);
    assert.equal(computeSkillFolderHash(setup.skillRoot), beforeHash);
    assert.deepEqual(fs.readFileSync(setup.lockPath), beforeLock);
    assert.equal(fs.readFileSync(path.join(setup.skillRoot, "version.txt"), "utf8"), "v1\n");
  }
});

test("legacy entries without a lock folder hash can still be updated and remain recoverable", (t) => {
  const setup = fixture("legacy-lock-hash-unavailable");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const lock = JSON.parse(fs.readFileSync(setup.lockPath, "utf8"));
  delete lock.skills[setup.skillName].skillFolderHash;
  writeJson(setup.lockPath, lock);

  const plan = planFor(setup);
  assert.deepEqual(plan.limitations.lockFolderHashUnavailable, [setup.skillName]);
  assert.equal(plan.entries[0].lockHashAvailable, false);
  const beforeHash = computeSkillFolderHash(setup.skillRoot);

  const receipt = executeTrustedSourceBatchV1({
    plan,
    confirmation: plan.confirmation.token,
    managerRunner: () => {
      writeFile(path.join(setup.skillRoot, "SKILL.md"), `---\nname: ${setup.skillName}\ndescription: Legacy fixture updated.\n---\nversion two\n`);
      writeFile(path.join(setup.skillRoot, "version.txt"), "v2\n");
      return {
        status: 0,
        stdout: `Updated ${setup.skillName}\n`,
        stderr: "",
      };
    },
    rescan: ({ diff }) => ({ ok: true, changed: diff.changed.map((item) => item.name) }),
    synchronize: () => ({ verification: { ok: true }, obsidianSynchronized: true }),
    clock: () => "2026-07-24T18:01:30.000Z",
  });

  assert.equal(receipt.status, "succeeded");
  assert.deepEqual(receipt.diff.changed.map((entry) => entry.name), [setup.skillName]);
  assert.deepEqual(receipt.diff.added, []);
  assert.deepEqual(receipt.diff.missing, []);
  assert.deepEqual(receipt.diff.sourceChanged, []);
  assert.equal(receipt.recovery.snapshotStatus, "retained-for-recovery");
  assert.equal(receipt.recovery.restored, false);
  assert.notEqual(computeSkillFolderHash(setup.skillRoot), beforeHash);
  assert.equal(fs.readFileSync(path.join(setup.skillRoot, "version.txt"), "utf8"), "v2\n");
  assert.match(receipt.managerResult.stdout, /Updated/);
});

test("real-profile planning includes only GitHub source-managed entries and separately blocks Plugins or unknown sources", (t) => {
  const setup = fixture("policy", { sourceType: "github", source: "owner/trusted", disposable: false });
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const lock = JSON.parse(fs.readFileSync(setup.lockPath, "utf8"));
  for (const [name, entry] of Object.entries({
    "plugin-skill": {
      source: "plugin/source",
      sourceType: "github",
      pluginName: "plugin",
      skillPath: "skills/plugin/SKILL.md",
      skillFolderHash: "0".repeat(64),
    },
    "unknown-skill": {
      source: "local/source",
      sourceType: "git",
      sourceUrl: "https://example.invalid/local/source",
      skillPath: "SKILL.md",
      skillFolderHash: "0".repeat(64),
    },
    "legacy-uncheckable": {
      source: "owner/legacy",
      sourceType: "github",
      skillPath: "SKILL.md",
    },
  })) lock.skills[name] = entry;
  writeFile(path.join(setup.profileRoot, ".agents", "skills", "legacy-uncheckable", "SKILL.md"), "---\nname: legacy-uncheckable\ndescription: Legacy fixture.\n---\n");
  writeJson(setup.lockPath, lock);

  const plan = createTrustedSourceBatchPlanV1({
    packageRoot,
    packageLockPath,
    profileRoot: setup.profileRoot,
    stateHome: setup.stateHome,
    privateRoot: path.join(setup.profileRoot, "workspace", ".private-maintenance"),
  });
  assert.equal(plan.executable, true);
  assert.deepEqual(plan.entries.map((entry) => entry.name), ["legacy-uncheckable", setup.skillName]);
  assert.deepEqual(plan.excluded.pluginManaged, ["plugin-skill"]);
  assert.deepEqual(plan.excluded.unknownSources, ["unknown-skill"]);
  assert.deepEqual(plan.limitations.lockFolderHashUnavailable, ["legacy-uncheckable"]);
  assert.equal(plan.excluded.systemManaged, true);
  assert.equal(plan.excluded.deletion, true);

  const blocked = createTrustedSourceBatchPlanV1({
    packageRoot,
    packageLockPath,
    profileRoot: setup.profileRoot,
    stateHome: setup.stateHome,
    privateRoot: setup.privateRoot,
    skillNames: ["plugin-skill"],
  });
  assert.equal(blocked.executable, false);
  assert.match(blocked.blockers.join(";"), /plugin-managed/);
});

test("standalone manage check-and-update stays blocked while an injected host uses the shared Core", (t) => {
  const unavailable = runSilentOrbitCli(["manage", "check-and-update", "--request", "unused.json", "--json"]);
  assert.equal(unavailable.exitCode, 1);
  assert.equal(unavailable.result.blocker, "host-adapter-required");

  const setup = fixture("cli-host");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const requestFile = path.join(setup.root, "request.json");
  writeJson(requestFile, { skillNames: [setup.skillName] });
  const dependencies = {
    trustedSourceMaintenanceHost: {
      planOptions: {
        packageRoot,
        packageLockPath,
        profileRoot: setup.profileRoot,
        stateHome: setup.stateHome,
        privateRoot: setup.privateRoot,
        allowDisposableSource: true,
      },
      managerRunner: () => ({ status: 0, stdout: "All global skills are up to date\n", stderr: "" }),
      rescan: () => ({ ok: true }),
      synchronize: () => ({ verification: { ok: true } }),
      clock: () => "2026-07-24T18:02:00.000Z",
    },
  };
  const preview = runSilentOrbitCli(["manage", "check-and-update", "--request", requestFile, "--json"], dependencies);
  assert.equal(preview.exitCode, 0);
  assert.equal(preview.result.executable, true);
  const applied = runSilentOrbitCli([
    "manage",
    "check-and-update",
    "--request",
    requestFile,
    "--confirm",
    preview.result.confirmation.token,
    "--json",
  ], dependencies);
  assert.equal(applied.exitCode, 0);
  assert.equal(applied.result.status, "succeeded");
});
