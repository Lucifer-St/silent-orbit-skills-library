import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSilentOrbitCli } from "../silent-orbit.mjs";
import {
  createCapabilityEvidenceV1,
  createProviderCapabilityV1,
  encodeManagementFile,
} from "../lib/skill-management.mjs";

function temporaryRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-management-cli-${label}-`));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function snapshot(root, relative = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      return entry.isDirectory()
        ? [{ path: `${next.split(path.sep).join("/")}/`, bytes: null }, ...snapshot(root, next)]
        : [{ path: next.split(path.sep).join("/"), bytes: fs.readFileSync(path.join(root, next)).toString("base64") }];
    });
}

function request() {
  return {
    providerId: "cli-synthetic",
    providerKind: "synthetic",
    providerLabel: "CLI Synthetic Provider",
    operation: "update",
    targets: [{
      id: "demo-skill",
      rootId: "fixture-root",
      relativePath: "skills\\demo-skill",
    }],
    parameters: { version: 2 },
  };
}

function provider(counters) {
  const evidence = createCapabilityEvidenceV1({
    providerId: "cli-synthetic",
    operation: "update",
    claim: "The CLI synthetic Provider delegates bounded writes to Core.",
    basis: { fixture: "skill-management-cli.test.mjs", contract: 1 },
  });
  const capability = createProviderCapabilityV1({
    providerId: "cli-synthetic",
    providerKind: "synthetic",
    label: "CLI Synthetic Provider",
    operations: {
      update: { state: "supported", evidenceIds: [evidence.id] },
    },
    evidence: [evidence],
  });
  return {
    id: "cli-synthetic",
    kind: "synthetic",
    label: "CLI Synthetic Provider",
    capability,
    probeCapability() {
      counters.probes += 1;
      return {
        state: "supported",
        capabilityId: capability.capabilityId,
        evidenceIds: [evidence.id],
      };
    },
    preview() {
      counters.previews += 1;
      return {
        changes: [{
          id: "write-skill",
          targetId: "demo-skill",
          action: "write-file",
          path: "SKILL.md",
          contentBase64: encodeManagementFile("---\nname: demo-skill\n---\ncli-updated\n"),
        }],
      };
    },
    apply({ plan, writer }) {
      counters.applies += 1;
      for (const change of plan.changes) writer.apply(change.id);
    },
    rescan({ plan, reader }) {
      counters.rescans += 1;
      return { targets: plan.targets.map((target) => ({ targetId: target.id, digest: reader.digest(target.id) })) };
    },
    verify() {
      counters.verifies += 1;
      return { ok: true, evidence: [{ kind: "cli-synthetic", value: "passed" }] };
    },
  };
}

test("the standalone CLI has no live Provider and emits a deterministic unknown/read-only JSON plan", (t) => {
  const root = temporaryRoot("unknown");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const requestFile = path.join(root, "request.json");
  writeJson(requestFile, request());
  const before = snapshot(root);
  const execution = runSilentOrbitCli(["manage", "plan", "--request", requestFile, "--json"]);
  assert.equal(execution.exitCode, 0);
  const plan = JSON.parse(execution.stdout);
  assert.equal(plan.capability.state, "unknown");
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.blockers, ["capability-unknown"]);
  assert.equal(plan.changes.length, 0);
  assert.deepEqual(snapshot(root), before);
});

test("CLI JSON plan and dry-run use only injected synthetic state and perform zero writes", (t) => {
  const root = temporaryRoot("dry-run");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const allowedRoot = path.join(root, "allowed");
  const target = path.join(allowedRoot, "skills", "demo-skill");
  const transactionRoot = path.join(root, "transactions");
  const requestFile = path.join(root, "request.json");
  const planFile = path.join(root, "plan.json");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), "---\nname: demo-skill\n---\noriginal\n", "utf8");
  writeJson(requestFile, request());
  const counters = { probes: 0, previews: 0, applies: 0, rescans: 0, verifies: 0 };
  const synthetic = provider(counters);
  const dependencies = {
    managementProviders: new Map([[synthetic.id, synthetic]]),
    managementAllowedRoots: { "fixture-root": allowedRoot },
    managementTransactionRoot: transactionRoot,
    managementClock: () => "2026-07-23T16:00:00.000Z",
  };
  const planExecution = runSilentOrbitCli(["manage", "plan", "--request", requestFile, "--json"], dependencies);
  assert.equal(planExecution.exitCode, 0);
  const plan = JSON.parse(planExecution.stdout);
  assert.equal(plan.executable, true);
  assert.equal(plan.targets[0].relativePath, "skills/demo-skill");
  writeJson(planFile, plan);

  const before = snapshot(root);
  const dryRun = runSilentOrbitCli(["manage", "apply", "--plan", planFile, "--dry-run", "--json"], dependencies);
  assert.equal(dryRun.exitCode, 0);
  const receipt = JSON.parse(dryRun.stdout);
  assert.equal(receipt.status, "dry-run");
  assert.equal(receipt.transaction.id, null);
  assert.equal(counters.applies, 0);
  assert.equal(counters.rescans, 0);
  assert.equal(counters.verifies, 0);
  assert.deepEqual(snapshot(root), before);
  assert.equal(fs.existsSync(transactionRoot), false);
});

test("CLI refuses an inexact confirmation and executes a confirmed synthetic plan only inside temporary allowed roots", (t) => {
  const root = temporaryRoot("confirm");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const allowedRoot = path.join(root, "allowed");
  const target = path.join(allowedRoot, "skills", "demo-skill");
  const transactionRoot = path.join(root, "transactions");
  const requestFile = path.join(root, "request.json");
  const planFile = path.join(root, "plan.json");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), "---\nname: demo-skill\n---\noriginal\n", "utf8");
  writeJson(requestFile, request());
  const counters = { probes: 0, previews: 0, applies: 0, rescans: 0, verifies: 0 };
  const synthetic = provider(counters);
  const dependencies = {
    managementProviders: { [synthetic.id]: synthetic },
    managementAllowedRoots: { "fixture-root": allowedRoot },
    managementTransactionRoot: transactionRoot,
    managementClock: () => "2026-07-23T16:02:00.000Z",
  };
  const plan = runSilentOrbitCli(["manage", "plan", "--request", requestFile, "--json"], dependencies).result;
  writeJson(planFile, plan);
  const before = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
  const blocked = runSilentOrbitCli(["manage", "apply", "--plan", planFile, "--confirm", "not-exact", "--json"], dependencies);
  assert.equal(blocked.exitCode, 1);
  assert.equal(blocked.result.status, "blocked");
  assert.equal(counters.applies, 0);
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8"), before);
  assert.equal(fs.existsSync(transactionRoot), false);

  const applied = runSilentOrbitCli(["manage", "apply", "--plan", planFile, "--confirm", plan.confirmation.token, "--json"], dependencies);
  assert.equal(applied.exitCode, 0);
  assert.equal(applied.result.status, "succeeded");
  assert.equal(counters.applies, 1);
  assert.equal(fs.readFileSync(path.join(target, "SKILL.md"), "utf8").endsWith("cli-updated\n"), true);
});
