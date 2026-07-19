import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { resolveDataDir } from "../project-layout.mjs";

const projectDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const dataDir = resolveDataDir(projectDir);

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, fileName), "utf8"));
}

test("separates authorship origin from visibility for every Skill", () => {
  const skills = readJson("skills.json");
  const origins = new Set(["third-party", "creator", "system", "unknown"]);
  const visibilities = new Set(["public", "creator-showcase", "local-only"]);

  assert.ok(skills.length > 100);
  for (const skill of skills) {
    assert.ok(origins.has(skill.origin), `${skill.name} origin`);
    assert.ok(visibilities.has(skill.visibility), `${skill.name} visibility`);
    assert.equal(Object.hasOwn(skill, "is_user_created"), false, `${skill.name} legacy ownership`);
  }

  const aihot = skills.find((skill) => skill.name === "aihot");
  assert.equal(aihot?.origin, "third-party");
  assert.equal(aihot?.visibility, "public");
  assert.equal(aihot?.description_i18n?.["en-US"].includes("AI news"), true);

  const beautifyReadme = skills.find((skill) => skill.name === "beautify-github-readme");
  assert.equal(beautifyReadme?.origin, "third-party");
  assert.equal(beautifyReadme?.visibility, "public");
  assert.equal(beautifyReadme?.library_key, "local:global");
  assert.equal(beautifyReadme?.repo, "oil-oil/beautify-github-readme");
  assert.equal(beautifyReadme?.repo_url, "https://github.com/oil-oil/beautify-github-readme");
  assert.ok(beautifyReadme?.description_i18n?.["zh-CN"]);
  assert.ok(beautifyReadme?.description_i18n?.["en-US"]);

  for (const name of ["fengxue", "fengxue-ai-weekly"]) {
    const skill = skills.find((candidate) => candidate.name === name);
    assert.equal(skill?.origin, "creator");
    assert.equal(skill?.visibility, "creator-showcase");
  }
});

test("shareable catalog data excludes workstation identifiers", () => {
  const serialized = ["skills.json", "libraries.json", "personal-skills.json"]
    .map((fileName) => fs.readFileSync(path.join(dataDir, fileName), "utf8"))
    .join("\n");

  const workstationOwner = ["Matt", "hew"].join("");
  for (const forbidden of ["C:\\Users\\", workstationOwner, "private:toolbox", "PRIVATE TOOLBOX", "is_user_created"]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden public data token: ${forbidden}`);
  }
});

test("change records provide copy for both interface locales", () => {
  for (const change of readJson("changes.json")) {
    assert.ok(change.title_i18n?.["zh-CN"], `${change.id} Chinese title`);
    assert.ok(change.title_i18n?.["en-US"], `${change.id} English title`);
    assert.ok(change.summary_i18n?.["zh-CN"], `${change.id} Chinese summary`);
    assert.ok(change.summary_i18n?.["en-US"], `${change.id} English summary`);
  }
});

test("English intent can reach localized Skill metadata", async () => {
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    root: projectDir,
    server: { middlewareMode: true },
  });
  try {
    const { appData } = await server.ssrLoadModule("/src/generated/data.generated.ts");
    const { createLibraryKeyIndex } = await server.ssrLoadModule("/src/lib/dataSelectors.ts");
    const { rankSkillRecords } = await server.ssrLoadModule("/src/lib/skillSearch.ts");
    const { localizedInstallStatus, localizedMetadataLabel } = await server.ssrLoadModule("/src/i18n/LocaleContext.tsx");
    const statuses = new Set(appData.skills.map((skill) => skill.status).filter(Boolean));
    for (const status of statuses) {
      assert.doesNotMatch(localizedInstallStatus(status, "en-US"), /[\u3400-\u9fff]/u, status);
    }
    assert.equal(localizedInstallStatus("启用插件提供", "en-US"), "Provided by enabled plugin");
    assert.equal(localizedInstallStatus("插件缓存/会话可用", "en-US"), "Available in plugin cache/session");
    assert.equal(localizedInstallStatus("系统内置", "en-US"), "Built in");
    const categoryUnits = readJson("category-units.json").flatMap((group) => group.units);
    const catalogLabels = new Set([
      ...categoryUnits.map((unit) => unit.kind ?? unit.type),
      ...appData.libraries.flatMap((library) => [library.kind_label ?? library.kind, library.source_label]),
    ].filter(Boolean));
    for (const label of catalogLabels) {
      assert.doesNotMatch(localizedMetadataLabel(label, "en-US"), /[\u3400-\u9fff]/u, label);
    }
    assert.equal(localizedMetadataLabel("插件包", "en-US"), "Plugin Package");
    assert.equal(localizedMetadataLabel("本地库", "en-US"), "Local Library");
    assert.equal(localizedMetadataLabel("单独 skill", "en-US"), "Standalone Skill");
    const results = rankSkillRecords(appData.skills, createLibraryKeyIndex(appData.libraries), {
      text: "Chinese AI news",
      category: "all",
      sourceKind: "all",
      starredOnly: false,
    });
    assert.equal(results[0]?.skill.name, "aihot");
    const weeklyResults = rankSkillRecords(appData.skills, createLibraryKeyIndex(appData.libraries), {
      text: "过去一周内值得关注的 AI 消息",
      category: "all",
      sourceKind: "all",
      starredOnly: false,
    });
    assert.deepEqual(weeklyResults.slice(0, 3).map((result) => result.skill.name), [
      "aihot",
      "fengxue-ai-weekly",
      "gmail",
    ]);
  } finally {
    await server.close();
  }
});
