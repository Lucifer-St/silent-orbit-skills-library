import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHealthReportV1, validateHealthReportV1 } from "../lib/skill-health.mjs";
import {
  createCodexGlobalSkillsAdapter,
  createNormalizedJsonAdapter,
  createSkillDirectoryAdapter,
  scanInventorySources,
} from "../lib/source-adapters.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generatedAt = "2026-07-01T12:00:00.000Z";
const projectConfig = {
  schemaVersion: 1,
  projectId: "health-fixture",
  title: { "en-US": "Health Fixture" },
  locales: ["en-US"],
  defaultLocale: "en-US",
  renderer: { theme: "reference-index", defaultRoute: "/" },
  privacy: {
    defaultVisibility: "public",
    publicVisibilities: ["public", "creator-showcase"],
    publishRawPaths: false,
    publishHashes: false,
    publishUsageEvidence: false,
  },
};

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, "fixtures", "phase4", name), "utf8"));
}

function anomalousSnapshot() {
  const missingRoot = path.join(os.tmpdir(), "silent-orbit-phase4-provider-not-present");
  return scanInventorySources({
    projectConfig,
    generatedAt,
    adapters: [
      createNormalizedJsonAdapter({ input: fixture("source-managed.source-import.json") }),
      createSkillDirectoryAdapter({ sourceKey: "failed-provider", root: missingRoot, label: "Failed Provider", updateChannel: "unknown" }),
      createNormalizedJsonAdapter({ input: fixture("external-provider.source-import.json") }),
    ],
  }).snapshot;
}

test("HealthReportV1 detects partial providers, failures, duplicates, conflicts, explicit versions, channels, and unresolved states", () => {
  const snapshot = anomalousSnapshot();
  const report = createHealthReportV1({ inventorySnapshot: snapshot, evaluatedAt: generatedAt });
  assert.equal(validateHealthReportV1(report), report);
  assert.deepEqual(report.summary, {
    providers: 3,
    sourceFailures: 1,
    sourcePartial: 1,
    skillIdentities: 6,
    present: 4,
    missing: 1,
    unknownPresence: 1,
    presenceConflicts: 0,
    duplicateIdentities: 1,
    identityConflicts: 1,
    versionsKnown: 2,
    versionsUnknown: 3,
    versionConflicts: 1,
    freshnessStale: 0,
    freshnessUnknown: 6,
    unresolved: 8,
  });
  assert.equal(report.status, "error");
  const orbitTools = report.skills.find((skill) => skill.name === "orbit-tools");
  assert.equal(orbitTools.duplicate, "duplicate");
  assert.equal(orbitTools.identity, "conflict");
  assert.deepEqual(orbitTools.version, { state: "conflict", values: ["1.0.0", "2.0.0"] });
  assert.equal(orbitTools.updateChannel, "mixed");
  assert.ok(orbitTools.unresolved.includes("identity-conflict"));
  assert.ok(report.providers.find((provider) => provider.scanState === "failed").unresolved.includes("source-failed"));
  assert.doesNotMatch(JSON.stringify(report), /provider-not-present|SKILL\.md|installedPath|raw command/i);
});

test("freshness remains unknown without policy and becomes stale only from explicit time and Snapshot evidence", () => {
  const snapshot = anomalousSnapshot();
  const unknown = createHealthReportV1({ inventorySnapshot: snapshot, evaluatedAt: "2026-07-22T12:00:00.000Z" });
  assert.equal(unknown.summary.freshnessUnknown, 6);
  assert.equal(unknown.summary.freshnessStale, 0);
  const stale = createHealthReportV1({ inventorySnapshot: snapshot, evaluatedAt: "2026-07-22T12:00:00.000Z", staleAfterDays: 7 });
  assert.equal(stale.policy.staleAfterDays, 7);
  assert.equal(stale.summary.freshnessStale, 6);
  assert.equal(stale.summary.freshnessUnknown, 0);
  const futureSnapshot = createHealthReportV1({ inventorySnapshot: snapshot, evaluatedAt: "2026-06-30T12:00:00.000Z", staleAfterDays: 7 });
  assert.equal(futureSnapshot.summary.freshnessUnknown, 6);
  assert.equal(futureSnapshot.summary.freshnessStale, 0);
});

test("missing version evidence stays unknown and never becomes an update claim", () => {
  const report = createHealthReportV1({ inventorySnapshot: anomalousSnapshot(), evaluatedAt: generatedAt });
  const unknown = report.skills.find((skill) => skill.name === "no-version-evidence");
  assert.deepEqual(unknown.version, { state: "unknown", values: [] });
  assert.ok(unknown.unresolved.includes("version-unknown"));
  assert.doesNotMatch(JSON.stringify(report), /all up.to.date|latest version|dependencies? (?:are|is)/i);
});

test("health identity and evidence are stable across Windows, macOS, and Linux provider paths", () => {
  const markdown = "---\nname: portable-health\ndescription: Portable metadata.\nversion: 3.2.1\n---\nPrivate body";
  const paths = [
    ["C:", "Users", "Example", ".agents", "skills", "portable-health"].join("\\"),
    ["", "Users", "example", ".agents", "skills", "portable-health"].join("/"),
    ["", "home", "example", ".agents", "skills", "portable-health"].join("/"),
  ];
  const reports = paths.map((entryPath) => {
    const snapshot = scanInventorySources({
      projectConfig,
      generatedAt,
      adapters: [createCodexGlobalSkillsAdapter({ entries: [{ name: "portable-health", path: entryPath, scope: "global", skillMarkdown: markdown }] })],
    }).snapshot;
    return createHealthReportV1({ inventorySnapshot: snapshot, evaluatedAt: generatedAt });
  });
  assert.deepEqual(reports[0], reports[1]);
  assert.deepEqual(reports[1], reports[2]);
  assert.doesNotMatch(JSON.stringify(reports[0]), /Users|home|Example/i);
});

test("HealthReportV1 validation rejects private evidence even when it is injected after creation", () => {
  const report = structuredClone(createHealthReportV1({ inventorySnapshot: anomalousSnapshot(), evaluatedAt: generatedAt }));
  const parts = ["C:", "Users", "Example", "private"];
  report.evidence[0].value = parts.join("\\");
  assert.throws(() => validateHealthReportV1(report), /private evidence/);
});
