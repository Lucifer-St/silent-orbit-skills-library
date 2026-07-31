import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMIZATION_MANAGED_FILES_V2,
  FRONTEND_HANDOFF_V2_BEHAVIORS,
  createFrontendHandoffV2,
  validateFrontendHandoffV2,
} from "../lib/generator-contracts.mjs";
import { createDefaultSilentOrbitConfigV1 } from "../lib/silent-orbit-project.mjs";

function fixture() {
  const project = createDefaultSilentOrbitConfigV1({
    projectId: "handoff-v2",
    title: "Handoff V2",
  }).project;
  const siteManifest = {
    schemaVersion: 1,
    projectId: project.projectId,
    generatedAt: "2026-07-30T12:00:00.000Z",
    snapshotRefs: {
      inventory: "inventory-fixture",
      library: "library-fixture",
    },
    renderer: { ...project.renderer },
    locales: [...project.locales],
    summary: {
      skills: 2,
      libraries: 1,
      categories: 1,
      collections: 0,
    },
    privacy: {
      includesLocalOnly: false,
      publicVisibilities: ["public", "creator-showcase"],
    },
  };
  const siteData = {
    project,
    siteManifest,
    appData: {
      skills: [
        { name: "public-skill", visibility: "public" },
        { name: "creator-skill", visibility: "creator-showcase" },
      ],
      libraries: [],
      categoryUnits: [],
      categorySkillNames: {},
    },
  };
  return { project, siteManifest, siteData };
}

test("FrontendHandoffV2 binds the generated public contract and refresh ownership", () => {
  const { project, siteManifest, siteData } = fixture();
  const handoff = createFrontendHandoffV2({ projectConfig: project, siteManifest });
  assert.equal(handoff.schemaVersion, 2);
  assert.equal(handoff.kind, "FrontendHandoffV2");
  assert.equal(handoff.binding.librarySnapshotId, "library-fixture");
  assert.deepEqual(handoff.refresh.managedFiles, [...CUSTOMIZATION_MANAGED_FILES_V2]);
  assert.equal(handoff.refresh.styleFilesImmutable, true);
  for (const behavior of FRONTEND_HANDOFF_V2_BEHAVIORS) {
    assert.ok(handoff.requiredBehavior.includes(behavior), behavior);
  }
  assert.equal(validateFrontendHandoffV2(handoff, { siteData }), handoff);
});

test("FrontendHandoffV2 blocks stale counts, non-public records, and widened refresh ownership", () => {
  const { project, siteManifest, siteData } = fixture();
  const handoff = createFrontendHandoffV2({ projectConfig: project, siteManifest });
  assert.throws(
    () => validateFrontendHandoffV2({
      ...handoff,
      binding: { ...handoff.binding, summary: { ...handoff.binding.summary, skills: 3 } },
    }, { siteData }),
    /summary binding is stale|Skill count is not membership-derived/,
  );
  assert.throws(
    () => validateFrontendHandoffV2(handoff, {
      siteData: {
        ...siteData,
        appData: {
          ...siteData.appData,
          skills: [
            siteData.appData.skills[0],
            { name: "private-skill", visibility: "local-only" },
          ],
        },
      },
    }),
    /non-public record/,
  );
  assert.throws(
    () => validateFrontendHandoffV2({
      ...handoff,
      refresh: {
        ...handoff.refresh,
        managedFiles: [...handoff.refresh.managedFiles, "styles.css"],
      },
    }),
    /managed files changed/,
  );
});
