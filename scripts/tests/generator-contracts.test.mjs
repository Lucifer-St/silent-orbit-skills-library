import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createLegacyGeneratorModel,
  validateInventorySnapshotV1,
} from "../lib/generator-contracts.mjs";
import { buildPublicData } from "../public-data.mjs";
import { resolveDataDir } from "../project-layout.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = resolveDataDir(projectDir);
const read = (fileName) => JSON.parse(fs.readFileSync(path.join(dataDir, fileName), "utf8"));
const legacyInput = {
  skills: read("skills.json"),
  libraries: read("libraries.json"),
  categoryUnits: read("category-units.json"),
  personalSkills: read("personal-skills.json"),
  changes: read("changes.json"),
  starredSkills: read("starred-skills.json"),
  relations: read("relations.json"),
  skillDetails: read("skill-details.json"),
  maintenanceStatus: read("maintenance-status.json"),
};
const publicData = buildPublicData(legacyInput);
const generatedAt = `${publicData.maintenanceStatus.snapshotDate}T12:00:00.000Z`;
const buildModel = () => createLegacyGeneratorModel({ data: publicData, generatedAt, sourceDir: "outputs/data" });

test("the four v1 schemas are versioned JSON Schema 2020-12 contracts", () => {
  for (const fileName of [
    "project-config.v1.schema.json",
    "inventory-snapshot.v1.schema.json",
    "library-snapshot.v1.schema.json",
    "site-manifest.v1.schema.json",
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(projectDir, "schemas", fileName), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.title, /V1$/);
  }
});

test("the normalized adapter input has a separate portable v1 schema", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(projectDir, "schemas", "source-import.v1.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.title, "SourceImportV1");
  assert.deepEqual(schema.required, ["schemaVersion", "source", "skills"]);
});

test("the CLI, overrides, and analysis report have versioned public contracts", () => {
  for (const [fileName, title] of [
    ["silent-orbit-config.v1.schema.json", "SilentOrbitConfigV1"],
    ["analysis-overrides.v1.schema.json", "AnalysisOverridesV1"],
    ["analysis-report.v1.schema.json", "AnalysisReportV1"],
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(projectDir, "schemas", fileName), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.title, title);
  }
});

test("legacy nine-file data migrates without losing the current public catalog", () => {
  const { librarySnapshot, appData, siteManifest } = buildModel();
  assert.equal(librarySnapshot.skills.length, 142);
  assert.equal(librarySnapshot.libraries.length, 28);
  assert.equal(librarySnapshot.categories.length, 9);
  assert.equal(librarySnapshot.collections.length, 1);
  assert.equal(appData.personalSkills.length, 3);
  assert.equal(appData.skillDetails.length, 5);
  assert.deepEqual(appData.skills.map((skill) => skill.name), publicData.skills.map((skill) => skill.name));
  assert.deepEqual(appData.libraries.map((library) => library.key), publicData.libraries.map((library) => library.key));
  assert.equal(siteManifest.summary.skills, 142);
});

test("category membership is the single count authority for every renderer surface", () => {
  const { librarySnapshot, appData } = buildModel();
  assert.deepEqual(appData.categoryUnits.map((category) => category.skill_count), [10, 22, 69, 3, 12, 20, 7, 4, 33]);
  for (const category of appData.categoryUnits) {
    assert.equal(category.skill_count, appData.categorySkillNames[category.category].length);
  }
  assert.equal(Object.hasOwn(librarySnapshot.categories[0], "skill_count"), false);
  assert.equal(JSON.stringify(librarySnapshot).includes('"skill_count"'), false);
  assert.equal(new Set(librarySnapshot.categoryMemberships.map((entry) => `${entry.categoryId}/${entry.skillId}`)).size, librarySnapshot.categoryMemberships.length);
});

test("stable ids are source-qualified and contain no machine paths", () => {
  const { inventorySnapshot, librarySnapshot } = buildModel();
  const ids = librarySnapshot.skills.map((skill) => skill.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("skill:") && !/[\\/]/.test(id)));
  assert.doesNotMatch(JSON.stringify({ inventorySnapshot, librarySnapshot }), /[A-Za-z]:\\Users\\|\/Users\//);
});

test("field provenance separates observed, inferred, and curated facts", () => {
  const { librarySnapshot } = buildModel();
  for (const skill of librarySnapshot.skills) {
    assert.ok(skill.provenance.observed.includes("name"));
    assert.ok(skill.provenance.curated.includes("visibility"));
    assert.ok(skill.provenance.inferred.includes("description"));
  }
});

test("Fengxue stays creator-showcase without private Canon or runtime evidence", () => {
  const { librarySnapshot } = buildModel();
  for (const name of ["fengxue", "fengxue-ai-weekly"]) {
    const skill = librarySnapshot.skills.find((candidate) => candidate.name === name);
    assert.equal(skill?.origin, "creator");
    assert.equal(skill?.visibility, "creator-showcase");
  }
  const payload = JSON.stringify(librarySnapshot);
  assert.doesNotMatch(payload, /relationship-canon|guardian permissions|private memory|task_count|installed path/i);
});

test("contract generation is byte-deterministic for unchanged inputs", () => {
  assert.equal(JSON.stringify(buildModel()), JSON.stringify(buildModel()));
});

test("snapshot ids are content-addressed rather than date-only labels", () => {
  const baseline = buildModel();
  const changedData = structuredClone(publicData);
  changedData.skills[0].description = `${changedData.skills[0].description} changed`;
  const changed = createLegacyGeneratorModel({ data: changedData, generatedAt, sourceDir: "outputs/data" });
  assert.notEqual(changed.librarySnapshot.snapshotId, baseline.librarySnapshot.snapshotId);
  assert.equal(changed.inventorySnapshot.snapshotId, baseline.inventorySnapshot.snapshotId);

  changedData.skills[0].status = "changed-status";
  const observedChange = createLegacyGeneratorModel({ data: changedData, generatedAt, sourceDir: "outputs/data" });
  assert.notEqual(observedChange.inventorySnapshot.snapshotId, baseline.inventorySnapshot.snapshotId);
});

test("sanitized inventory rejects local-only records", () => {
  const { inventorySnapshot } = buildModel();
  const invalid = structuredClone(inventorySnapshot);
  invalid.items[0].visibility = "local-only";
  assert.throws(() => validateInventorySnapshotV1(invalid), /local-only/);
});

test("legacy inventory exposes only read-only source capabilities and current summaries", () => {
  const { inventorySnapshot } = buildModel();
  assert.ok(inventorySnapshot.sources.every((source) => source.capabilities.discovery === "read-only" && source.capabilities.write === false));
  assert.ok(inventorySnapshot.sources.filter((source) => source.providerKind === "plugin").every((source) => source.capabilities.updateChannel === "external"));
  assert.ok(inventorySnapshot.sources.filter((source) => source.providerKind === "repo").every((source) => source.capabilities.updateChannel === "source-managed"));
  assert.equal(inventorySnapshot.summary.sources, inventorySnapshot.sources.length);
  assert.equal(inventorySnapshot.summary.items, 142);
  assert.deepEqual(inventorySnapshot.diagnostics, []);
});

test("sanitized inventory runtime validation rejects adapter-only private evidence fields", () => {
  const { inventorySnapshot } = buildModel();
  const invalid = structuredClone(inventorySnapshot);
  invalid.items[0].observed = { installedPath: "relative/private/location", hash: "abc123" };
  assert.throws(() => validateInventorySnapshotV1(invalid), /unsupported fields/);
});
