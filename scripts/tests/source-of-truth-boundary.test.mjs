import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicScriptFiles, publicSourceFiles } from "../public-release-config.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = path.resolve(projectDir, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
const read = (relative) => fs.readFileSync(path.join(projectDir, ...relative.split("/")), "utf8");

test("the installable package owns only public Core, Schemas, CLI, Agent Skill, docs, and reference renderer", () => {
  assert.deepEqual(packageJson.files, [
    "scripts/silent-orbit.mjs",
    "scripts/lib/generator-contracts.mjs",
    "scripts/lib/source-adapters.mjs",
    "scripts/lib/skill-health.mjs",
    "scripts/lib/skill-management.mjs",
    "scripts/lib/npx-skills-source-managed-evaluation.mjs",
    "scripts/lib/trusted-source-maintenance.mjs",
    "scripts/lib/library-analyzer.mjs",
    "scripts/lib/silent-orbit-project.mjs",
    "schemas",
    "templates/reference-index-v1",
    "GENERATOR_QUICKSTART.md",
    "GENERATOR_QUICKSTART.zh-CN.md",
    "INSTALLATION_AND_UPGRADE.md",
    "INSTALLATION_AND_UPGRADE.zh-CN.md",
    "VERSIONING_AND_MIGRATIONS.md",
    "VERSIONING_AND_MIGRATIONS.zh-CN.md",
    "PRIVACY.md",
    "PRIVACY.zh-CN.md",
    "RECOVERY.md",
    "RECOVERY.zh-CN.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "skills/build-skill-cosmos",
    "skills/audit-skill-cosmos",
    "skills/manage-skill-cosmos",
    "skills/skills-library-maintenance",
  ]);
  assert.equal(packageJson.version, "0.11.0-beta.4");
  assert.equal(packageJson.devDependencies.skills, "1.5.20");
  assert.equal(packageJson.bin["silent-orbit"], "scripts/silent-orbit.mjs");
  assert.equal(packageJson.files.some((entry) => /alpha\/phase1e|silent-orbit-v1|outputs|obsidian|receipt/i.test(entry)), false);
});

test("the public generator Core has no author-only nine-file adapter or renderer compatibility path", () => {
  assert.doesNotMatch(read("scripts/lib/generator-contracts.mjs"), /createLegacyGeneratorModel|Legacy public data|resolveLegacyLibrary/);
  assert.doesNotMatch(read("scripts/lib/silent-orbit-project.mjs"), /"silent-orbit"\s*:\s*"silent-orbit-v1"/);
  assert.match(read("scripts/lib/silent-orbit-project.mjs"), /"reference-index"\s*:\s*"reference-index-v1"/);
});

test("Private inventory, curation, Outcomes, usage, Obsidian, and run evidence are outside public allowlists", () => {
  const forbidden = [
    "lib/phase2b-private-library.mjs",
    "run-phase2b-dogfood.mjs",
    "tests/generator-contracts.test.mjs",
  ];
  for (const relative of forbidden) assert.equal(publicScriptFiles.includes(relative), false, `${relative} crossed the Public script boundary`);
  assert.equal(publicSourceFiles.some((relative) => /outputs\/data|\.dogfood|obsidian|phase2b-dogfood-receipt/i.test(relative)), false);
  const privateLayout = fs.existsSync(path.join(repositoryRoot, "outputs", "data", "skills.json"));
  if (privateLayout) {
    assert.equal(fs.existsSync(path.join(projectDir, "scripts", "lib", "phase2b-private-library.mjs")), true);
    assert.equal(fs.existsSync(path.join(projectDir, "scripts", "run-phase2b-dogfood.mjs")), true);
    assert.match(fs.readFileSync(path.join(repositoryRoot, ".gitignore"), "utf8"), /work\/agent-os-index\/\.dogfood\//);
  }
});

test("Public checkout consumes canonical generated contracts while Private owns the source projection", () => {
  const sync = read("scripts/sync-data.mjs");
  assert.match(sync, /project-config\.json/);
  assert.match(sync, /inventory\.snapshot\.json/);
  assert.match(sync, /library\.snapshot\.json/);
  assert.match(sync, /site-manifest\.json/);
  assert.match(sync, /if \(flatPublicLayout\)/);
  assert.match(sync, /phase2b-private-library\.mjs/);
});
