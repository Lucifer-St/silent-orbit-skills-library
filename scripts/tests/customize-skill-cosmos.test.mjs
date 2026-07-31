import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicSkillRoot = path.join(packageRoot, "skills", "customize-skill-cosmos");
const privateSkillRoot = path.resolve(packageRoot, "../..", "skills", "customize-skill-cosmos");
const skillRoot = fs.existsSync(publicSkillRoot) ? publicSkillRoot : privateSkillRoot;

test("customize-skill-cosmos is a portable thin orchestration Skill", () => {
  const required = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/cli-contract.md",
    "references/interview-contract.md",
    "references/direction-review-contract.md",
    "references/frontend-contract.md",
  ];
  for (const relative of required) assert.ok(fs.existsSync(path.join(skillRoot, relative)), relative);
  assert.equal(fs.existsSync(path.join(skillRoot, "scripts")), false);
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  for (const token of [
    "exactly two",
    "keep/adjust/reject/redo",
    "customize refresh",
    "stylePreserved: true",
    "customization/current/",
    "independent-human acceptance",
  ]) {
    assert.ok(skill.includes(token), token);
  }
  assert.doesNotMatch(skill, /netlify\s+deploy|git\s+push|gh\s+pr\s+create/i);
  const cli = fs.readFileSync(path.join(skillRoot, "references", "cli-contract.md"), "utf8");
  assert.match(cli, /require version `0\.5\.x`/);
  assert.match(cli, /v2-sidecar/);
  const frontend = fs.readFileSync(path.join(skillRoot, "references", "frontend-contract.md"), "utf8");
  assert.match(frontend, /site-data\.json[\s\S]*frontend-handoff\.v2\.json/);
  assert.match(frontend, /style-owned/);
});

test("customize-skill-cosmos keeps creative review separate from governance and Skill mutation", () => {
  const combined = fs.readdirSync(path.join(skillRoot, "references"))
    .map((name) => fs.readFileSync(path.join(skillRoot, "references", name), "utf8"))
    .join("\n");
  assert.match(combined, /Never change visibility, origin, taxonomy, membership|never/i);
  assert.doesNotMatch(combined, /npx\s+skills\s+(?:add|remove|check)|silent-orbit\s+manage/i);
  assert.match(combined, /raw interview|raw conversation/i);
});
