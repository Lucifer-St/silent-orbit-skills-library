import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicSkillDir = path.join(projectDir, "skills", "build-skill-cosmos");
const privateSkillDir = path.resolve(projectDir, "..", "..", "skills", "build-skill-cosmos");
const skillDir = fs.existsSync(publicSkillDir) ? publicSkillDir : privateSkillDir;

function read(relativePath) {
  return fs.readFileSync(path.join(skillDir, ...relativePath.split("/")), "utf8");
}

function collectFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      return entry.isDirectory() ? collectFiles(root, next) : [next];
    });
}

test("build-skill-cosmos has a concise skill-creator package", () => {
  const files = collectFiles(skillDir);
  assert.deepEqual(files, [
    "agents/openai.yaml",
    "references/cli-contract.md",
    "references/project-schema.md",
    "references/review-contract.md",
    "SKILL.md",
  ]);
  const markdown = read("SKILL.md");
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter);
  assert.deepEqual(frontmatter[1].split("\n").map((line) => line.split(":", 1)[0]), ["name", "description"]);
  assert.match(frontmatter[1], /^name: build-skill-cosmos$/m);
  assert.doesNotMatch(markdown, /\bTODO\b/);
  assert.ok(markdown.split("\n").length < 120);

  const agentYaml = read("agents/openai.yaml");
  assert.match(agentYaml, /display_name: "Build Skill Cosmos"/);
  const shortDescription = agentYaml.match(/short_description: "([^"]+)"/)?.[1] ?? "";
  assert.ok(shortDescription.length >= 25 && shortDescription.length <= 64);
  assert.match(agentYaml, /default_prompt: "Use \$build-skill-cosmos /);
});

test("the Agent Skill stays a thin CLI and review layer", () => {
  const allText = collectFiles(skillDir).map((file) => read(file)).join("\n");
  for (const command of ["init", "import", "scan", "analyze", "diff", "generate", "doctor"]) {
    assert.match(allText, new RegExp(`silent-orbit ${command}|\\b${command} --project`));
  }
  for (const boundary of ["Never install", "Never read Obsidian", "Never push", "Never recreate scanner", "real Skills unchanged"]) {
    assert.ok(allText.includes(boundary), `Missing boundary: ${boundary}`);
  }
  for (const sourceType of ["skill-folder", "codex-global", "codex-plugin", "json-import"]) assert.ok(allText.includes(sourceType));
  for (const visibility of ["public", "creator-showcase", "review-required", "local-only"]) assert.ok(allText.includes(visibility));
  for (const handoff of ["reference-index", "frontend-handoff.md", "preferred frontend Skill", "not an official art direction"]) assert.ok(allText.includes(handoff));
  assert.equal(collectFiles(skillDir).some((file) => /\.(?:js|mjs|py|ps1|sh)$/i.test(file)), false);
});
