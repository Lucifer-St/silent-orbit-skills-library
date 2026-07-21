import assert from "node:assert/strict";
import test from "node:test";
import { analyzeInventorySnapshotV1, createDefaultAnalysisOverridesV1, validateAnalysisOverridesV1 } from "../lib/library-analyzer.mjs";
import { createNormalizedJsonAdapter, scanInventorySources } from "../lib/source-adapters.mjs";
import { createDefaultSilentOrbitConfigV1 } from "../lib/silent-orbit-project.mjs";

const generatedAt = "2026-07-21T15:00:00.000Z";
const projectConfig = createDefaultSilentOrbitConfigV1({ projectId: "portable-analysis", title: "Portable Analysis" }).project;

function inventoryFor(skills, { sourceKey = "independent-team", reverse = false } = {}) {
  const input = {
    schemaVersion: 1,
    source: { key: sourceKey, label: "Independent Team", providerKind: "json-import" },
    skills: reverse ? [...skills].reverse() : skills,
  };
  return scanInventorySources({
    projectConfig,
    generatedAt,
    adapters: [createNormalizedJsonAdapter({ input })],
  }).snapshot;
}

function baseSkills() {
  return [
    { name: "source-scout", visibility: "public", description: "Research sources and preserve citations.", trigger: "$source-scout" },
    { name: "pixel-painter", visibility: "public", description: "Create design and image concepts.", trigger: "$pixel-painter" },
    { name: "cross-domain", visibility: "public", description: "Research data for a decision.", trigger: "$cross-domain" },
    { name: "mystery", visibility: "public", description: "A capability with no known vocabulary.", trigger: "$mystery" },
    { name: "unconfirmed", description: "Browser automation that has not been reviewed." },
    { name: "private-entry", visibility: "local-only", description: "Never publish this record." },
  ];
}

test("transparent rules classify unique matches and route ties or unknowns to Review Required", () => {
  const inventorySnapshot = inventoryFor(baseSkills());
  const result = analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot, analysisOverrides: createDefaultAnalysisOverridesV1() });
  const byName = new Map(result.librarySnapshot.skills.map((skill) => [skill.name, skill]));
  assert.equal(byName.get("source-scout").legacyCategory, "Research & Knowledge");
  assert.equal(byName.get("pixel-painter").legacyCategory, "Creative & Media");
  assert.equal(byName.get("cross-domain").legacyCategory, "Review Required");
  assert.equal(byName.get("mystery").legacyCategory, "Review Required");
  assert.equal(byName.has("unconfirmed"), false);
  assert.equal(byName.has("private-entry"), false);
  assert.equal(result.analysisReport.summary.reviewRequired, 3);
  assert.ok(result.librarySnapshot.categoryMemberships.some((entry) => entry.basis.includes("inferred-rule")));
  assert.ok(result.librarySnapshot.categoryMemberships.some((entry) => entry.basis.includes("review-required")));
});

test("curated overrides replace metadata and category decisions without mutating Inventory", () => {
  const inventorySnapshot = inventoryFor(baseSkills());
  const original = structuredClone(inventorySnapshot);
  const overrides = createDefaultAnalysisOverridesV1();
  overrides.skillOverrides.push({
    selector: { sourceKey: "independent-team", name: "mystery" },
    description: "Runs a reviewed operational workflow.",
    trigger: "$mystery --reviewed",
    categoryKeys: ["automation-operations"],
    primaryCategoryKey: "automation-operations",
  });
  overrides.libraryOverrides.push({ sourceKey: "independent-team", title: "Team Toolkit", kind: "team-library" });
  overrides.collections.push({ key: "starter", kind: "curated", title: "Starter Set", skills: [{ sourceKey: "independent-team", name: "mystery" }] });
  const result = analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot, analysisOverrides: overrides });
  const skill = result.librarySnapshot.skills.find((candidate) => candidate.name === "mystery");
  assert.equal(skill.description, "Runs a reviewed operational workflow.");
  assert.equal(skill.trigger, "$mystery --reviewed");
  assert.equal(skill.legacyCategory, "Automation & Operations");
  assert.ok(skill.provenance.curated.includes("description"));
  assert.ok(skill.provenance.curated.includes("categoryMemberships"));
  assert.equal(result.librarySnapshot.libraries[0].title, "Team Toolkit");
  assert.deepEqual(result.librarySnapshot.collections[0].skillIds, [skill.id]);
  assert.deepEqual(inventorySnapshot, original);
});

test("analyzer output is deterministic across input ordering", () => {
  const forward = analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot: inventoryFor(baseSkills()), analysisOverrides: createDefaultAnalysisOverridesV1() });
  const reverse = analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot: inventoryFor(baseSkills(), { reverse: true }), analysisOverrides: createDefaultAnalysisOverridesV1() });
  assert.deepEqual(forward, reverse);
});

test("same-name overrides require a source-qualified selector", () => {
  const first = inventoryFor([{ name: "shared", visibility: "public", description: "Research sources." }], { sourceKey: "source-a" });
  const second = inventoryFor([{ name: "shared", visibility: "public", description: "Design images." }], { sourceKey: "source-b" });
  const inventorySnapshot = {
    ...first,
    snapshotId: "combined-inventory",
    sources: [...first.sources, ...second.sources].sort((left, right) => left.id.localeCompare(right.id, "en")),
    items: [...first.items, ...second.items].sort((left, right) => left.id.localeCompare(right.id, "en")),
    diagnostics: [],
    summary: { sources: 2, items: 2, warnings: 0, errors: 0 },
  };
  const overrides = createDefaultAnalysisOverridesV1();
  overrides.skillOverrides.push({ selector: { name: "shared" }, categoryKeys: ["research-knowledge"], primaryCategoryKey: "research-knowledge" });
  assert.throws(() => analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot, analysisOverrides: overrides }), /resolved 2/);
});

test("override validation rejects private evidence and unknown categories", () => {
  const privateOverrides = createDefaultAnalysisOverridesV1();
  privateOverrides.skillOverrides.push({ selector: { name: "mystery" }, description: ["C:", "Users", "Example", "private"].join("\\") });
  assert.throws(() => validateAnalysisOverridesV1(privateOverrides), /private evidence/);
  const unknown = createDefaultAnalysisOverridesV1();
  unknown.skillOverrides.push({ selector: { name: "mystery" }, categoryKeys: ["invented"], primaryCategoryKey: "invented" });
  assert.throws(() => validateAnalysisOverridesV1(unknown), /unknown category/);
});

test("renderer-ready output has one count authority and sanitized local handoff semantics", () => {
  const inventorySnapshot = inventoryFor(baseSkills());
  const result = analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot, analysisOverrides: createDefaultAnalysisOverridesV1() });
  for (const category of result.appData.categoryUnits) {
    assert.equal(category.skill_count, result.appData.categorySkillNames[category.category].length);
  }
  assert.equal(result.librarySnapshot.maintenanceStatus.publicationHandoff.productionAuthority, "local-library");
  assert.equal(result.siteManifest.privacy.includesLocalOnly, false);
  assert.doesNotMatch(JSON.stringify(result), /private-entry|installedPath|task_count|[A-Za-z]:\\Users\\/i);
});
