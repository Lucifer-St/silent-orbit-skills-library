import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicData, deriveCategorySkillNames } from "../public-data.mjs";

test("public data removes local-only Skills and every dangling reference", () => {
  const result = buildPublicData({
    skills: [
      { name: "public", category: "A", library_key: "lib:public", visibility: "public" },
      { name: "private", category: "A", library_key: "lib:private", visibility: "local-only" },
    ],
    libraries: [
      { key: "lib:public", skills: ["public"] },
      { key: "lib:private", skills: ["private"] },
    ],
    categoryUnits: [{ category: "A", skill_count: 2, units: [
      { title: "Public", skills: ["public"], skill_count: 1 },
      { title: "Private", skills: ["private"], skill_count: 1 },
    ] }],
    personalSkills: [{ name: "private", visibility: "local-only" }],
    changes: [
      { id: "public-change", skill: "public" },
      { id: "private-change", skill: "private", visibility: "local-only" },
    ],
    starredSkills: [{ skill: "private" }],
    relations: [
      { source: { type: "skill", id: "private" }, target: { type: "category", id: "A" } },
      { source: { type: "skill", id: "public" }, target: { type: "category", id: "A" } },
    ],
    skillDetails: [{ skill: "private" }, { skill: "public" }],
    maintenanceStatus: {
      privacy: "sanitized",
      publicationHandoff: {
        productionAuthority: "public-github-main",
        publicRepository: "Lucifer-St/silent-orbit-skills-library",
        requiredCheck: "release-gate",
        deployProvider: "netlify",
        directPrivateProductionDeploy: false,
      },
    },
  });

  assert.deepEqual(result.skills.map((skill) => skill.name), ["public"]);
  assert.deepEqual(result.libraries.map((library) => library.key), ["lib:public"]);
  assert.deepEqual(result.categoryUnits[0].units.map((unit) => unit.title), ["Public"]);
  assert.equal(result.categoryUnits[0].skill_count, 1);
  assert.deepEqual(result.personalSkills, []);
  assert.deepEqual(result.changes.map((change) => change.id), ["public-change"]);
  assert.deepEqual(result.starredSkills, []);
  assert.equal(result.relations.length, 1);
  assert.deepEqual(result.skillDetails.map((detail) => detail.skill), ["public"]);
  assert.deepEqual(result.maintenanceStatus.publicationHandoff, {
    productionAuthority: "public-github-main",
    publicRepository: "Lucifer-St/silent-orbit-skills-library",
    requiredCheck: "release-gate",
    deployProvider: "netlify",
    directPrivateProductionDeploy: false,
  });
});

test("category summaries derive the same membership union used by the renderer", () => {
  const skills = [
    { name: "in-unit", category: "Elsewhere", visibility: "public" },
    { name: "direct-member", category: "A", visibility: "public" },
  ];
  const categoryUnits = [{
    category: "A",
    skill_count: 99,
    units: [{ type: "skill", title: "in-unit", skills: ["in-unit"], skill_count: 99 }],
  }];
  const categorySkillNames = deriveCategorySkillNames(skills, categoryUnits);
  assert.deepEqual(categorySkillNames.A, ["direct-member", "in-unit"]);
});
