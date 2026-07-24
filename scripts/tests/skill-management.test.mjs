import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createCapabilityEvidenceV1,
  createManagementPlanV1,
  createProviderCapabilityV1,
  createUnknownManagementProvider,
  encodeManagementFile,
  executeManagementPlanV1,
  managementOperations,
  normalizePortableRelativePath,
  validateProviderCapabilityV1,
} from "../lib/skill-management.mjs";

const FIXED_TIME = "2026-07-23T16:00:00.000Z";

function temporaryRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-phase5-${label}-`));
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function fileSnapshot(root, relative = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return [{ path: `${next.split(path.sep).join("/")}/`, bytes: null }, ...fileSnapshot(root, next)];
      return [{ path: next.split(path.sep).join("/"), bytes: fs.readFileSync(path.join(root, next)).toString("base64") }];
    });
}

function requestFor(operation = "update", relativePath = "skills/demo-skill") {
  return {
    providerId: "synthetic-provider",
    providerKind: "synthetic",
    providerLabel: "Synthetic Provider",
    operation,
    targets: [{
      id: "demo-skill",
      rootId: "fixture-root",
      relativePath,
    }],
    parameters: {
      fixture: "phase5a",
    },
  };
}

function updateChanges() {
  return [
    {
      id: "write-skill",
      targetId: "demo-skill",
      action: "write-file",
      path: "SKILL.md",
      contentBase64: encodeManagementFile("---\nname: demo-skill\n---\nupdated\n"),
    },
    {
      id: "write-metadata",
      targetId: "demo-skill",
      action: "write-file",
      path: "metadata.json",
      contentBase64: encodeManagementFile('{"version":2}\n'),
    },
  ];
}

function syntheticProvider({
  operation = "update",
  state = "supported",
  changes = updateChanges(),
  failAfterChanges,
  failRescan = false,
  verification = "pass",
  counters = {},
} = {}) {
  Object.assign(counters, {
    probes: 0,
    previews: 0,
    applies: 0,
    rescans: 0,
    verifies: 0,
  });
  const evidence = state === "supported"
    ? createCapabilityEvidenceV1({
      providerId: "synthetic-provider",
      operation,
      kind: "contract-test",
      claim: `Synthetic ${operation} uses bounded Core writes.`,
      basis: { fixture: "skill-management.test.mjs", contract: 1 },
    })
    : null;
  const capability = createProviderCapabilityV1({
    providerId: "synthetic-provider",
    providerKind: "synthetic",
    label: "Synthetic Provider",
    operations: {
      [operation]: {
        state,
        evidenceIds: evidence ? [evidence.id] : [],
      },
    },
    evidence: evidence ? [evidence] : [],
  });
  return {
    id: "synthetic-provider",
    kind: "synthetic",
    label: "Synthetic Provider",
    capability,
    probeCapability({ operation: requestedOperation }) {
      counters.probes += 1;
      const record = capability.operations[requestedOperation];
      return {
        state: record.state,
        capabilityId: capability.capabilityId,
        evidenceIds: [...record.evidenceIds],
      };
    },
    preview() {
      counters.previews += 1;
      return { changes };
    },
    apply({ plan, writer }) {
      counters.applies += 1;
      let applied = 0;
      for (const change of plan.changes) {
        writer.apply(change.id);
        applied += 1;
        if (failAfterChanges === applied) throw new Error("Synthetic Provider failed after a partial write.");
      }
    },
    rescan({ plan, reader }) {
      counters.rescans += 1;
      if (failRescan) throw new Error("Synthetic Provider rescan failed.");
      return {
        targets: plan.targets.map((target) => ({
          targetId: target.id,
          digest: reader.digest(target.id),
        })),
      };
    },
    verify() {
      counters.verifies += 1;
      if (verification === "fail") return { ok: false, message: "Synthetic Provider verification failed.", evidence: [] };
      return { ok: true, evidence: [{ kind: "synthetic-verification", value: "passed" }] };
    },
  };
}

function fixture(label) {
  const root = temporaryRoot(label);
  const allowedRoot = path.join(root, "allowed");
  const target = path.join(allowedRoot, "skills", "demo-skill");
  const transactionRoot = path.join(root, "transactions");
  fs.mkdirSync(allowedRoot, { recursive: true });
  writeFile(path.join(target, "SKILL.md"), "---\nname: demo-skill\n---\noriginal\n");
  writeFile(path.join(target, "metadata.json"), '{"version":1}\n');
  return {
    root,
    allowedRoot,
    target,
    transactionRoot,
    allowedRoots: { "fixture-root": allowedRoot },
  };
}

test("Phase 5A publishes versioned capability, plan, and receipt schemas", () => {
  for (const [fileName, title] of [
    ["provider-capability.v1.schema.json", "ProviderCapabilityV1"],
    ["management-plan.v1.schema.json", "ManagementPlanV1"],
    ["management-receipt.v1.schema.json", "ManagementReceiptV1"],
  ]) {
    const schema = JSON.parse(fs.readFileSync(new URL(`../../schemas/${fileName}`, import.meta.url), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.title, title);
    assert.equal(schema.additionalProperties, false);
  }
});

test("ProviderCapabilityV1 defaults every operation to frozen unknown/read-only and verifies supported evidence", () => {
  const unknown = createProviderCapabilityV1({
    providerId: "unknown-provider",
    providerKind: "synthetic",
    label: "Unknown Provider",
  });
  assert.equal(unknown.defaultState, "unknown");
  assert.equal(unknown.readOnly, true);
  assert.equal(Object.isFrozen(unknown), true);
  assert.equal(Object.isFrozen(unknown.operations), true);
  assert.deepEqual(Object.keys(unknown.operations), managementOperations);
  for (const operation of managementOperations) {
    assert.deepEqual(unknown.operations[operation], {
      state: "unknown",
      access: "read-only",
      evidenceIds: [],
    });
  }

  assert.throws(() => createProviderCapabilityV1({
    providerId: "broken-provider",
    providerKind: "synthetic",
    label: "Broken Provider",
    operations: { update: { state: "supported" } },
  }), /requires verifiable evidence/);
  assert.throws(() => createProviderCapabilityV1({
    providerId: "broken-provider",
    providerKind: "synthetic",
    label: "Broken Provider",
    operations: { update: { state: "maybe" } },
  }), /supported, unsupported, or unknown/);

  const evidence = createCapabilityEvidenceV1({
    providerId: "supported-provider",
    operation: "update",
    claim: "A bounded synthetic update contract is present.",
    basis: { testVector: "phase5a-update-v1" },
  });
  const supported = createProviderCapabilityV1({
    providerId: "supported-provider",
    providerKind: "synthetic",
    label: "Supported Provider",
    operations: {
      update: { state: "supported", evidenceIds: [evidence.id] },
      remove: { state: "unsupported" },
    },
    evidence: [evidence],
  });
  assert.equal(supported.readOnly, false);
  assert.equal(supported.operations.update.access, "guarded");
  assert.equal(supported.operations.remove.access, "read-only");
  const tampered = structuredClone(supported);
  tampered.evidence[0].verification.digest = "0".repeat(64);
  assert.throws(() => validateProviderCapabilityV1(tampered), /does not verify/);
});

test("ManagementPlanV1 is deterministic and path-independent for Windows and POSIX separators", (t) => {
  const setup = fixture("portable");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const provider = syntheticProvider();
  const windowsPlan = createManagementPlanV1({
    provider,
    request: requestFor("update", "skills\\demo-skill"),
    allowedRoots: setup.allowedRoots,
  });
  const posixPlan = createManagementPlanV1({
    provider,
    request: requestFor("update", "skills/demo-skill"),
    allowedRoots: setup.allowedRoots,
  });
  assert.deepEqual(windowsPlan, posixPlan);
  assert.equal(windowsPlan.targets[0].relativePath, "skills/demo-skill");
  assert.equal(JSON.stringify(windowsPlan).includes(setup.allowedRoot), false);
  assert.deepEqual(windowsPlan.steps.map((entry) => entry.phase), [
    "precondition", "backup", "apply", "rescan", "verify", "rollback", "receipt",
  ]);
  assert.equal(windowsPlan.confirmation.token, `CONFIRM update synthetic-provider ${windowsPlan.planId}`);
  assert.throws(() => normalizePortableRelativePath(["C:", "Users", "person", "skill"].join("\\")), /Windows drive/);
  assert.throws(() => normalizePortableRelativePath(["", "home", "person", "skill"].join("/")), /must not be absolute/);
  assert.throws(() => normalizePortableRelativePath("../skill"), /normalized child path/);
});

test("target and change traversal plus overlapping transaction roots are rejected before writes", (t) => {
  const setup = fixture("bounds");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const sentinel = path.join(setup.root, "outside.txt");
  writeFile(sentinel, "unchanged\n");
  assert.throws(() => createManagementPlanV1({
    provider: syntheticProvider(),
    request: requestFor("update", "..\\outside"),
    allowedRoots: setup.allowedRoots,
  }), /normalized child path/);
  assert.throws(() => createManagementPlanV1({
    provider: syntheticProvider({
      changes: [{
        id: "escape-write",
        targetId: "demo-skill",
        action: "write-file",
        path: "../outside.txt",
        contentBase64: encodeManagementFile("changed\n"),
      }],
    }),
    request: requestFor(),
    allowedRoots: setup.allowedRoots,
  }), /normalized child path/);

  const provider = syntheticProvider();
  const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
  const before = fileSnapshot(setup.allowedRoot);
  assert.throws(() => executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: path.join(setup.allowedRoot, "transactions"),
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  }), /disjoint/);
  assert.deepEqual(fileSnapshot(setup.allowedRoot), before);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "unchanged\n");
});

test("dry-run returns a complete in-memory receipt with zero real writes", (t) => {
  const setup = fixture("dry-run");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const counters = {};
  const provider = syntheticProvider({ counters });
  const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
  const before = fileSnapshot(setup.allowedRoot);
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    dryRun: true,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "dry-run");
  assert.equal(receipt.dryRun, true);
  assert.equal(receipt.transaction.id, null);
  assert.equal(receipt.transaction.persistedReceipt, false);
  assert.equal(counters.applies, 0);
  assert.equal(counters.rescans, 0);
  assert.equal(counters.verifies, 0);
  assert.deepEqual(fileSnapshot(setup.allowedRoot), before);
  assert.equal(fs.existsSync(setup.transactionRoot), false);
});

test("exact confirmation gates every mutation and successful transactions persist backup, rescan, verification, and receipt", (t) => {
  const setup = fixture("success");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const counters = {};
  const provider = syntheticProvider({ counters });
  const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
  const before = fileSnapshot(setup.allowedRoot);
  const blocked = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: `${plan.confirmation.token}-wrong`,
    clock: () => FIXED_TIME,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.errors[0].code, "exact-confirmation-required");
  assert.equal(counters.applies, 0);
  assert.deepEqual(fileSnapshot(setup.allowedRoot), before);
  assert.equal(fs.existsSync(setup.transactionRoot), false);

  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.confirmation.matched, true);
  assert.equal(receipt.verification.status, "passed");
  assert.equal(receipt.rollback.status, "not-needed");
  assert.equal(receipt.transaction.persistedReceipt, true);
  assert.equal(receipt.rescan[0].digest, plan.targets[0].expectedAfterDigest);
  assert.equal(fs.readFileSync(path.join(setup.target, "SKILL.md"), "utf8").endsWith("updated\n"), true);
  const transactionDirectory = path.join(setup.transactionRoot, receipt.transaction.id);
  assert.equal(fs.existsSync(path.join(transactionDirectory, "backup-manifest.json")), true);
  assert.equal(fs.existsSync(path.join(transactionDirectory, "receipt.json")), true);
});

test("partial writes roll back and restore the exact pre-action digest", (t) => {
  const setup = fixture("partial");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const provider = syntheticProvider({ failAfterChanges: 1 });
  const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
  const before = fileSnapshot(setup.allowedRoot);
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "rolled-back");
  assert.equal(receipt.rollback.status, "succeeded");
  assert.equal(receipt.rollback.restored[0].digest, plan.targets[0].expectedDigest);
  assert.deepEqual(fileSnapshot(setup.allowedRoot), before);
  const replanned = createManagementPlanV1({ provider: syntheticProvider(), request: requestFor(), allowedRoots: setup.allowedRoots });
  assert.equal(replanned.targets[0].expectedDigest, plan.targets[0].expectedDigest);
});

test("Provider rescan failure and verification failure each trigger stable digest restoration", (t) => {
  const setup = fixture("provider-failures");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  for (const [label, provider] of [
    ["rescan", syntheticProvider({ failRescan: true })],
    ["verification", syntheticProvider({ verification: "fail" })],
  ]) {
    const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
    const before = fileSnapshot(setup.allowedRoot);
    const transactionRoot = path.join(setup.root, `transactions-${label}`);
    const receipt = executeManagementPlanV1({
      plan,
      provider,
      allowedRoots: setup.allowedRoots,
      transactionRoot,
      confirmation: plan.confirmation.token,
      clock: () => label === "rescan" ? FIXED_TIME : "2026-07-23T16:01:00.000Z",
    });
    assert.equal(receipt.status, "rolled-back", label);
    assert.equal(receipt.rollback.restored[0].digest, plan.targets[0].expectedDigest, label);
    assert.deepEqual(fileSnapshot(setup.allowedRoot), before, label);
  }
});

test("target digest drift blocks before backup or Provider execution", (t) => {
  const setup = fixture("drift");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const counters = {};
  const provider = syntheticProvider({ counters });
  const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
  writeFile(path.join(setup.target, "SKILL.md"), "---\nname: demo-skill\n---\ndrifted\n");
  const receipt = executeManagementPlanV1({
    plan,
    provider,
    allowedRoots: setup.allowedRoots,
    transactionRoot: setup.transactionRoot,
    confirmation: plan.confirmation.token,
    clock: () => FIXED_TIME,
  });
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.errors[0].code, "target-digest-drift");
  assert.equal(counters.applies, 0);
  assert.equal(fs.existsSync(setup.transactionRoot), false);
  assert.equal(fs.readFileSync(path.join(setup.target, "SKILL.md"), "utf8").endsWith("drifted\n"), true);
});

test("rollback failure is explicit and can never be reported as success", (t) => {
  const setup = fixture("rollback-failure");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  const provider = syntheticProvider({ failAfterChanges: 1 });
  const plan = createManagementPlanV1({ provider, request: requestFor(), allowedRoots: setup.allowedRoots });
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
  assert.equal(receipt.rollback.failures.length, 1);
  assert.ok(receipt.errors.some((entry) => entry.code === "rollback-failed"));
  assert.notEqual(receipt.status, "succeeded");
  assert.equal(fs.readFileSync(path.join(setup.target, "SKILL.md"), "utf8").endsWith("updated\n"), true);
});

test("unknown and unsupported Providers never preview, apply, or create transaction state", (t) => {
  const setup = fixture("read-only-providers");
  t.after(() => fs.rmSync(setup.root, { recursive: true, force: true }));
  for (const state of ["unknown", "unsupported"]) {
    const counters = {};
    const provider = state === "unknown"
      ? {
        ...createUnknownManagementProvider({
          providerId: "synthetic-provider",
          providerKind: "synthetic",
          label: "Synthetic Provider",
        }),
        preview() { counters.previews = (counters.previews ?? 0) + 1; return { changes: updateChanges() }; },
        apply() { counters.applies = (counters.applies ?? 0) + 1; },
      }
      : syntheticProvider({ state, counters });
    const plan = createManagementPlanV1({
      provider,
      request: requestFor(),
      allowedRoots: setup.allowedRoots,
    });
    assert.equal(plan.executable, false);
    assert.deepEqual(plan.blockers, [`capability-${state}`]);
    assert.equal(counters.previews ?? 0, 0);
    const receipt = executeManagementPlanV1({
      plan,
      provider,
      allowedRoots: setup.allowedRoots,
      transactionRoot: path.join(setup.root, `transactions-${state}`),
      confirmation: plan.confirmation.token,
      clock: () => FIXED_TIME,
    });
    assert.equal(receipt.status, "blocked");
    assert.equal(counters.applies ?? 0, 0);
    assert.equal(fs.existsSync(path.join(setup.root, `transactions-${state}`)), false);
  }
});

test("Phase 5A management code contains no built-in global Skill command or user-data discovery path", () => {
  const core = fs.readFileSync(new URL("../lib/skill-management.mjs", import.meta.url), "utf8");
  const cli = fs.readFileSync(new URL("../silent-orbit.mjs", import.meta.url), "utf8");
  for (const source of [core, cli]) {
    assert.doesNotMatch(source, /node:child_process|execFile|spawnSync|homedir\(|\.codex|npx\s+skills|skills\s+(?:add|update|remove)|Obsidian|sessionsRoot|usageRoot/);
  }
  assert.match(cli, /managementProviders \?\? new Map\(\)/);
  assert.match(cli, /createUnknownManagementProvider/);
});
