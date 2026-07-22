import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRendererViewModel,
  createCategoryId,
  createInventorySnapshotV1,
  createLibraryId,
  createLibrarySnapshotV1,
  createSiteManifestV1,
  createSkillId,
  createSourceId,
  validateProjectConfigV1,
} from "../lib/generator-contracts.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the public generator contracts use versioned JSON Schema 2020-12", () => {
  for (const fileName of [
    "project-config.v1.schema.json",
    "inventory-snapshot.v1.schema.json",
    "library-snapshot.v1.schema.json",
    "site-manifest.v1.schema.json",
    "source-import.v1.schema.json",
    "silent-orbit-config.v1.schema.json",
    "analysis-overrides.v1.schema.json",
    "analysis-report.v1.schema.json",
    "health-report.v1.schema.json",
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(projectDir, "schemas", fileName), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  }
});

test("the public Core builds one deterministic renderer model without Private inputs", () => {
  const generatedAt = "2026-07-22T12:00:00.000Z";
  const sourceId = createSourceId("portable-source");
  const libraryId = createLibraryId(sourceId);
  const skillId = createSkillId("portable-source", "portable-skill");
  const categoryId = createCategoryId("Research");
  const projectConfig = validateProjectConfigV1({
    schemaVersion: 1,
    projectId: "portable-project",
    title: { "en-US": "Portable Project" },
    locales: ["en-US"],
    defaultLocale: "en-US",
    renderer: { theme: "reference-index", defaultRoute: "/" },
    privacy: {
      defaultVisibility: "review-required",
      publicVisibilities: ["public", "creator-showcase"],
      publishRawPaths: false,
      publishHashes: false,
      publishUsageEvidence: false,
    },
  });
  const inventorySnapshot = createInventorySnapshotV1({
    projectId: projectConfig.projectId,
    generatedAt,
    sources: [{
      id: sourceId,
      providerKind: "normalized-json",
      label: "Portable Source",
      scanState: "complete",
      capabilities: { discovery: "read-only", write: false, updateChannel: "unknown" },
    }],
    items: [{ id: skillId, kind: "skill", name: "portable-skill", sourceId, state: "present", origin: "third-party", visibility: "public" }],
  });
  const librarySnapshot = createLibrarySnapshotV1({
    projectId: projectConfig.projectId,
    generatedAt,
    skills: [{
      id: skillId,
      name: "portable-skill",
      description: "Portable public metadata.",
      trigger: "$portable-skill",
      legacyCategory: "Research",
      primaryCategoryId: categoryId,
      sourceId,
      libraryId,
      libraryTitle: "Portable Source",
      origin: "third-party",
      visibility: "public",
      provenance: { observed: ["name"], inferred: ["libraryId"], curated: ["categoryMemberships"] },
    }],
    libraries: [{
      id: libraryId,
      key: sourceId,
      sourceId,
      title: "Portable Source",
      kind: "normalized-json",
      kindLabel: "normalized-json",
      sourceLabel: "Portable Source",
      description: "Read-only source.",
      skillIds: [skillId],
    }],
    categories: [{ id: categoryId, name: "Research", unitIds: [] }],
    units: [],
    categoryMemberships: [{ categoryId, skillId, basis: ["curated-override"] }],
  });
  const siteManifest = createSiteManifestV1({ projectConfig, inventorySnapshot, librarySnapshot });
  const first = buildRendererViewModel({ librarySnapshot, generatedAt, sourceDir: "library.snapshot.json" });
  const second = buildRendererViewModel({ librarySnapshot, generatedAt, sourceDir: "library.snapshot.json" });
  assert.deepEqual(siteManifest.summary, { skills: 1, libraries: 1, categories: 1, collections: 0 });
  assert.deepEqual(first, second);
  assert.deepEqual(first.categorySkillNames, { Research: ["portable-skill"] });
});
