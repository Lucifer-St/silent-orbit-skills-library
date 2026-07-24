import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicSkillDir = path.join(projectDir, "skills", "audit-skill-cosmos");
const privateSkillDir = path.resolve(projectDir, "..", "..", "skills", "audit-skill-cosmos");
const skillDir = fs.existsSync(publicSkillDir) ? publicSkillDir : privateSkillDir;

function read(relativePath) {
  return fs.readFileSync(path.join(skillDir, ...relativePath.split("/")), "utf8").replace(/\r\n?/g, "\n");
}

function collectFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      return entry.isDirectory() ? collectFiles(root, next) : [next];
    });
}

test("audit-skill-cosmos is a concise skill-creator package", () => {
  assert.deepEqual(collectFiles(skillDir), ["agents/openai.yaml", "SKILL.md"]);
  const markdown = read("SKILL.md");
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter);
  assert.deepEqual(frontmatter[1].split("\n").map((line) => line.split(":", 1)[0]), ["name", "description"]);
  assert.match(frontmatter[1], /^name: audit-skill-cosmos$/m);
  assert.doesNotMatch(markdown, /\bTODO\b/);
  assert.ok(markdown.split("\n").length < 80);

  const agentYaml = read("agents/openai.yaml");
  assert.match(agentYaml, /display_name: "Audit Skill Cosmos"/);
  const shortDescription = agentYaml.match(/short_description: "([^"]+)"/)?.[1] ?? "";
  assert.ok(shortDescription.length >= 25 && shortDescription.length <= 64);
  assert.match(agentYaml, /default_prompt: "Use \$audit-skill-cosmos /);
});

test("the Agent Skill only explains CLI audit evidence and never implements or performs mutation", () => {
  const markdown = read("SKILL.md");
  assert.match(markdown, /silent-orbit audit --project <directory> --json/);
  for (const concept of ["provider failures", "presence", "duplicate", "identity conflicts", "version evidence", "update channels", "freshness", "unresolved"]) {
    assert.match(markdown.toLowerCase(), new RegExp(concept));
  }
  for (const boundary of ["Never install", "Never edit project", "Never implement", "Never read usage", "Never push"]) {
    assert.ok(markdown.includes(boundary), `Missing boundary: ${boundary}`);
  }
  assert.match(markdown, /Do not run `scan`, `analyze`, `diff`, `generate`, or `doctor`/);
  assert.match(markdown, /Never claim that everything is updated/);
  assert.equal(collectFiles(skillDir).some((file) => /\.(?:js|mjs|py|ps1|sh)$/i.test(file)), false);
});
