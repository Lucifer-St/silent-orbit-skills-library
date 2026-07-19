import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { hashToUnit, pointOnEllipse, stableOrbitPoint } from "../../src/lib/orbitLayout.ts";

async function loadModelBuilders() {
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    root: process.cwd(),
    server: { middlewareMode: true },
  });
  try {
    const mapModel = await server.ssrLoadModule("/src/lib/mapModel.ts");
    const orbitModel = await server.ssrLoadModule("/src/lib/orbitModel.ts");
    const cosmosAssets = await server.ssrLoadModule("/src/lib/cosmosAssets.ts");
    const indexes = await server.ssrLoadModule("/src/data/indexes.ts");
    const portal = await server.ssrLoadModule("/src/components/console/SilentOrbitPortal.tsx");
    return {
      buildSkillMapModel: mapModel.buildSkillMapModel,
      buildOrbitMapModel: orbitModel.buildOrbitMapModel,
      cosmosAssetPools: cosmosAssets.cosmosAssetPools,
      cosmosIcons: cosmosAssets.cosmosIcons,
      getCatalogArrivalVisual: cosmosAssets.getCatalogArrivalVisual,
      getLibraryVisual: cosmosAssets.getLibraryVisual,
      getRelicVisual: cosmosAssets.getRelicVisual,
      getSkillVisual: cosmosAssets.getSkillVisual,
      getSystemVisual: cosmosAssets.getSystemVisual,
      skills: indexes.skills,
      SilentOrbitPortal: portal.SilentOrbitPortal,
    };
  } finally {
    await server.close();
  }
}

test("hashToUnit is stable and bounded", () => {
  assert.equal(hashToUnit("station:obsidian", "angle"), hashToUnit("station:obsidian", "angle"));
  assert.ok(hashToUnit("station:obsidian", "angle") >= 0);
  assert.ok(hashToUnit("station:obsidian", "angle") < 1);
});

test("different salts produce different dimensions", () => {
  assert.notEqual(hashToUnit("station:obsidian", "angle"), hashToUnit("station:obsidian", "radius"));
});

test("pointOnEllipse returns cardinal points", () => {
  assert.deepEqual(pointOnEllipse({ x: 50, y: 50 }, 20, 10, 0), { x: 70, y: 50 });
  assert.deepEqual(pointOnEllipse({ x: 50, y: 50 }, 20, 10, 0.25), { x: 50, y: 60 });
});

test("stableOrbitPoint stays bounded and deterministic", () => {
  const point = stableOrbitPoint("skill:html-ppt", { x: 50, y: 50 }, 24, 15);
  assert.ok(point.x >= 26 && point.x <= 74);
  assert.ok(point.y >= 35 && point.y <= 65);
  assert.deepEqual(point, stableOrbitPoint("skill:html-ppt", { x: 50, y: 50 }, 24, 15));
});

test("buildOrbitMapModel preserves standalone skill units", async () => {
  const { buildSkillMapModel, buildOrbitMapModel } = await loadModelBuilders();
  const skillName = "windows-workstation-baseline";
  const category = "Systems & Operations";
  const data = {
    generatedAt: "2026-07-10T00:00:00.000Z",
    sourceDir: "test",
    skills: [{
      name: skillName,
      description: "Test standalone skill",
      trigger: "Use for workstation maintenance",
      category,
      library_key: "local:global",
      library_title: "Global Codex Skills",
    }],
    libraries: [],
    categoryUnits: [{
      category,
      skill_count: 1,
      units: [{ type: "skill", title: skillName, skill_count: 1, skills: [skillName] }],
    }],
    personalSkills: [],
    changes: [],
    starredSkills: [],
    relations: [],
  };

  const base = buildSkillMapModel(data);
  const orbit = buildOrbitMapModel(data);
  const stationId = `station:skill:${skillName}`;

  assert.equal(orbit.skills.length, base.skillDots.length);
  assert.deepEqual(orbit.skills.map((skill) => skill.id), base.skillDots.map((skill) => skill.id));
  assert.equal(orbit.skills[0].stationId, stationId);
  assert.equal(orbit.libraries.find((station) => station.id === stationId)?.title, skillName);
});

test("cosmos visual mappings are deterministic and stay inside their semantic pools", async () => {
  const {
    cosmosAssetPools,
    getLibraryVisual,
    getCatalogArrivalVisual,
    getRelicVisual,
    getSkillVisual,
    getSystemVisual,
    skills,
  } = await loadModelBuilders();

  assert.equal(getSystemVisual(0), getSystemVisual(9));
  assert.equal(getRelicVisual(1), getRelicVisual(10));
  assert.equal(getLibraryVisual("station:library:local:obsidian"), getLibraryVisual("station:library:local:obsidian"));
  assert.equal(getSkillVisual("skill:obsidian-vault"), getSkillVisual("skill:obsidian-vault"));
  assert.equal(getCatalogArrivalVisual("skill:obsidian-vault"), getCatalogArrivalVisual("skill:obsidian-vault"));
  assert.ok(cosmosAssetPools.systems.includes(getSystemVisual(4)));
  assert.ok(cosmosAssetPools.libraries.includes(getLibraryVisual("station:library:local:obsidian")));
  assert.ok(cosmosAssetPools.skills.includes(getSkillVisual("skill:obsidian-vault")));
  assert.ok(cosmosAssetPools.relics.includes(getRelicVisual(7)));
  assert.ok(cosmosAssetPools.catalogArrivals.includes(getCatalogArrivalVisual("skill:obsidian-vault")));
  assert.equal(cosmosAssetPools.catalogArrivals.length, 12);
  assert.equal(
    new Set(skills.map((skill) => getCatalogArrivalVisual(skill.name))).size,
    cosmosAssetPools.catalogArrivals.length,
  );
});

test("every production cosmos asset resolves from public assets", async () => {
  const { cosmosAssetPools, cosmosIcons } = await loadModelBuilders();
  const publicAssets = [...Object.values(cosmosAssetPools).flat(), ...Object.values(cosmosIcons)];

  assert.ok(publicAssets.length > 0);
  for (const asset of publicAssets) {
    assert.match(asset, /^\/assets\/cosmos\//);
    assert.equal(
      existsSync(path.join(process.cwd(), "public", asset.replace(/^\/assets\//, "assets/"))),
      true,
      `missing production asset ${asset}`,
    );
  }
});

test("canonical station identity and Orbit position survive display-title renames", async () => {
  const { buildOrbitMapModel } = await loadModelBuilders();
  const data = {
    generatedAt: "2026-07-10T00:00:00.000Z",
    sourceDir: "test",
    skills: [{
      name: "obsidian-vault",
      description: "Test library skill",
      trigger: "Use for a local vault",
      category: "Knowledge Systems",
      library_key: "local:obsidian",
      library_title: "Obsidian Vault Tools",
    }],
    libraries: [{
      key: "local:obsidian",
      title: "Obsidian Vault Tools",
      kind: "local",
      kind_label: "Local",
      source_label: "obsidian",
      description: "Test library",
      page: "Libraries/obsidian.md",
      skills: ["obsidian-vault"],
      primary_category: "Knowledge Systems",
    }],
    categoryUnits: [{
      category: "Knowledge Systems",
      skill_count: 1,
      units: [{
        type: "library",
        title: "Obsidian Vault Tools",
        skill_count: 1,
        skills: ["obsidian-vault"],
        page: "Libraries/obsidian.md",
      }],
    }],
    personalSkills: [],
    changes: [],
    starredSkills: [],
    relations: [],
  };
  const renamed = {
    ...data,
    skills: data.skills.map((skill) => ({ ...skill, library_title: "本地知识工作台" })),
    libraries: data.libraries.map((library) => ({ ...library, title: "本地知识工作台" })),
    categoryUnits: data.categoryUnits.map((category) => ({
      ...category,
      units: category.units.map((unit) => ({ ...unit, title: "本地知识工作台" })),
    })),
  };

  const before = buildOrbitMapModel(data);
  const after = buildOrbitMapModel(renamed);
  const beforeStation = before.libraries[0];
  const afterStation = after.libraries[0];
  const beforeSkill = before.skills[0];
  const afterSkill = after.skills[0];

  assert.equal(beforeStation.id, "station:library:local:obsidian");
  assert.equal(afterStation.id, beforeStation.id);
  assert.deepEqual(afterStation.position, beforeStation.position);
  assert.equal(afterSkill.id, beforeSkill.id);
  assert.equal(afterSkill.stationId, beforeSkill.stationId);
  assert.equal(afterSkill.stationId, afterStation.id);
  assert.deepEqual(afterSkill.position, beforeSkill.position);
});

test("portal skill traces preserve the canonical skill ID exactly once", async () => {
  const { buildOrbitMapModel, SilentOrbitPortal } = await loadModelBuilders();
  const skillName = "single-signal";
  const category = "Signals";
  const data = {
    generatedAt: "2026-07-10T00:00:00.000Z",
    sourceDir: "test",
    skills: [{
      name: skillName,
      description: "Test signal",
      trigger: "Use for a signal",
      category,
      library_key: "local:global",
      library_title: "Global Skills",
    }],
    libraries: [],
    categoryUnits: [{
      category,
      skill_count: 1,
      units: [{ type: "skill", title: skillName, skill_count: 1, skills: [skillName] }],
    }],
    personalSkills: [],
    changes: [],
    starredSkills: [],
    relations: [],
  };
  const markup = renderToStaticMarkup(React.createElement(SilentOrbitPortal, {
    model: buildOrbitMapModel(data),
    onOpenSystem() {},
  }));

  assert.match(markup, /data-skill-trace="skill:single-signal"/);
  assert.doesNotMatch(markup, /skill:skill:/);
  assert.doesNotMatch(markup, /class="portal-entry-trigger"/);
  assert.match(markup, /class="portal-system-hit"/);
  assert.match(markup, /data-system-id="zone:Signals"/);
  assert.doesNotMatch(markup, /<button[^>]*class="silent-orbit-portal/);
});

test("canonical station prefixes remain spatially separated within one system", async () => {
  const { buildOrbitMapModel } = await loadModelBuilders();
  const category = "Knowledge Systems";
  const skillNames = ["obsidian-vault", "computer-use", "windows-workstation-baseline", "interview-prep"];
  const libraries = [
    {
      key: "local:obsidian",
      title: "Obsidian",
      kind: "local",
      kind_label: "Local",
      source_label: "obsidian",
      description: "Local vault",
      page: "Libraries/obsidian.md",
      skills: ["obsidian-vault"],
      primary_category: category,
    },
    {
      key: "plugin:computer-use",
      title: "Computer Use",
      kind: "plugin",
      kind_label: "Plugin",
      source_label: "computer-use",
      description: "Computer control",
      page: "Libraries/computer-use.md",
      skills: ["computer-use"],
      primary_category: category,
    },
  ];
  const data = {
    generatedAt: "2026-07-10T00:00:00.000Z",
    sourceDir: "test",
    skills: skillNames.map((name) => ({
      name,
      description: name,
      trigger: `Use ${name}`,
      category,
      library_key: libraries.find((library) => library.skills.includes(name))?.key ?? "local:global",
      library_title: libraries.find((library) => library.skills.includes(name))?.title ?? "Global Skills",
    })),
    libraries,
    categoryUnits: [{
      category,
      skill_count: skillNames.length,
      units: [
        { type: "library", title: "Obsidian", skill_count: 1, skills: ["obsidian-vault"], page: "Libraries/obsidian.md" },
        { type: "library", title: "Computer Use", skill_count: 1, skills: ["computer-use"], page: "Libraries/computer-use.md" },
        { type: "skill", title: "windows-workstation-baseline", skill_count: 1, skills: ["windows-workstation-baseline"] },
        { type: "skill", title: "interview-prep", skill_count: 1, skills: ["interview-prep"] },
      ],
    }],
    personalSkills: [],
    changes: [],
    starredSkills: [],
    relations: [],
  };

  const stations = buildOrbitMapModel(data).libraries;
  const mobileCenterDistances = stations.flatMap((station, index) => stations.slice(index + 1).map((other) => (
    Math.hypot(
      (station.position.x - other.position.x) * 3.9,
      (station.position.y - other.position.y) * 8.2,
    )
  )));

  assert.equal(stations.length, 4);
  assert.ok(
    Math.min(...mobileCenterDistances) >= 44,
    `minimum projected 390x820 station-center separation was ${Math.min(...mobileCenterDistances)}px`,
  );
});

test("synthetic private home base keeps its canonical station and skill linkage", async () => {
  const { buildOrbitMapModel } = await loadModelBuilders();
  const privateSkill = {
    name: "private-helper",
    description: "Private local helper",
    trigger: "Use private helper",
    category: "个人常用",
    library_key: "personal:deck",
    library_title: "个人常用",
  };
  const data = {
    generatedAt: "2026-07-10T00:00:00.000Z",
    sourceDir: "test",
    skills: [],
    libraries: [],
    categoryUnits: [{ category: "Signals", skill_count: 0, units: [] }],
    personalSkills: [privateSkill],
    changes: [],
    starredSkills: [],
    relations: [],
  };

  const orbit = buildOrbitMapModel(data);
  const homeBase = orbit.libraries.find((station) => station.isPrivateHomeBase);
  const skill = orbit.skills.find((candidate) => candidate.name === privateSkill.name);

  assert.equal(homeBase?.id, "station:library:personal:deck");
  assert.equal(skill?.id, "skill:private-helper");
  assert.equal(skill?.stationId, homeBase?.id);
});
