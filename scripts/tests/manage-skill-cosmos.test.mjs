import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicSkillDir = path.join(projectDir, "skills", "manage-skill-cosmos");
const privateSkillDir = path.resolve(projectDir, "..", "..", "skills", "manage-skill-cosmos");
const skillDir = fs.existsSync(publicSkillDir) ? publicSkillDir : privateSkillDir;

function read(relativePath) {
  return fs.readFileSync(path.join(skillDir, ...relativePath.split("/")), "utf8").replace(/\r\n/g, "\n");
}

function collectFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      return entry.isDirectory() ? collectFiles(root, next) : [next];
    });
}

test("manage-skill-cosmos is a concise skill-creator package", () => {
  assert.deepEqual(collectFiles(skillDir), ["agents/openai.yaml", "SKILL.md"]);
  const markdown = read("SKILL.md");
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter);
  assert.deepEqual(frontmatter[1].split("\n").map((line) => line.split(":", 1)[0]), ["name", "description"]);
  assert.match(frontmatter[1], /^name: manage-skill-cosmos$/m);
  assert.doesNotMatch(markdown, /\bTODO\b/);
  assert.ok(markdown.split("\n").length < 100);

  const agentYaml = read("agents/openai.yaml");
  assert.match(agentYaml, /display_name: "Manage Skill Cosmos"/);
  const shortDescription = agentYaml.match(/short_description: "([^"]+)"/)?.[1] ?? "";
  assert.ok(shortDescription.length >= 25 && shortDescription.length <= 64);
  assert.match(agentYaml, /default_prompt: "Use \$manage-skill-cosmos /);
});

test("the Agent Skill only explains Provider results and guarded CLI plans", () => {
  const markdown = read("SKILL.md");
  const normalizedMarkdown = markdown.toLowerCase().replace(/\s+/g, " ");
  for (const command of [
    "silent-orbit manage check-and-update --request <trusted-batch-request.json> --json",
    'silent-orbit manage check-and-update --request <trusted-batch-request.json> --confirm "<exact batch token>" --json',
    "silent-orbit manage plan --request <request.json> --json",
    "silent-orbit manage apply --plan <plan.json> --dry-run --json",
    'silent-orbit manage apply --plan <plan.json> --confirm "<exact token>" --json',
  ]) assert.ok(markdown.includes(command), `Missing CLI command: ${command}`);
  for (const concept of [
    "capability state",
    "evidence ids",
    "digest preconditions",
    "backup",
    "verification",
    "rollback",
    "exact confirmation",
    "rollback-failed",
    "go/no-go",
    "failed criteria",
    "native `check` aliases the mutation path",
    "native phase 5a",
    "trusted external",
    "one batch approval",
    "lightweight before-snapshot",
    "failure-only restore",
    "same core",
    "non-read-only",
  ]) assert.match(normalizedMarkdown, new RegExp(concept));
  for (const boundary of [
    "Do not scan the Skill surface independently",
    "Do not implement Provider detection",
    "Do not call install, update, freeze, remove, or restore outside the guarded",
    "The standalone CLI registry is empty",
    "standalone CLI has no trusted maintenance host",
    "marked disposable profile",
  ]) assert.ok(markdown.includes(boundary), `Missing boundary: ${boundary}`);
  assert.equal(collectFiles(skillDir).some((file) => /\.(?:js|mjs|py|ps1|sh)$/i.test(file)), false);
  assert.doesNotMatch(markdown, /node:fs|writeFileSync|createManagementPlanV1|executeManagementPlanV1/);
});
