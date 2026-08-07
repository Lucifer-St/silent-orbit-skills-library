import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateAgentSkills } from "../validate-agent-skills.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const privateSkillRoot = path.resolve(projectDir, "..", "..", "skills");
const publicSkillRoot = path.join(projectDir, "skills");
const sourceSkillRoot = fs.existsSync(publicSkillRoot) ? publicSkillRoot : privateSkillRoot;

function withSkillsCopy(callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-skill-validation-"));
  const skillsRoot = path.join(tempRoot, "skills");
  fs.cpSync(sourceSkillRoot, skillsRoot, { recursive: true });
  try {
    return callback(skillsRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test("all five bundled Agent Skills satisfy one release-grade package contract", () => {
  const result = validateAgentSkills({ rootDir: projectDir });
  assert.equal(result.skills, 5);
  assert.ok(result.files >= 20);
  assert.ok(result.references >= 9);
});

test("validation rejects stale or ambiguous UI metadata", () => {
  withSkillsCopy((skillsRoot) => {
    const agentPath = path.join(skillsRoot, "audit-skill-cosmos", "agents", "openai.yaml");
    const original = fs.readFileSync(agentPath, "utf8");
    fs.writeFileSync(agentPath, original.replace("$audit-skill-cosmos", "$wrong-skill"));
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /default_prompt must explicitly invoke \$audit-skill-cosmos/,
    );
  });

  withSkillsCopy((skillsRoot) => {
    const agentPath = path.join(skillsRoot, "audit-skill-cosmos", "agents", "openai.yaml");
    const original = fs.readFileSync(agentPath, "utf8");
    fs.writeFileSync(
      agentPath,
      original.replace(
        "explain a supplied HealthReportV1 or audit one configured Silent Orbit project without making changes",
        "install and update my global Skill library",
      ),
    );
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /default_prompt must stay scoped to HealthReportV1 or one configured project/,
    );
  });
});

test("validation rejects extra frontmatter and broken references", () => {
  withSkillsCopy((skillsRoot) => {
    const skillPath = path.join(skillsRoot, "build-skill-cosmos", "SKILL.md");
    const original = fs.readFileSync(skillPath, "utf8");
    fs.writeFileSync(skillPath, original.replace("description:", "version: 1\ndescription:"));
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /frontmatter must contain only name and description/,
    );
  });

  withSkillsCopy((skillsRoot) => {
    const missing = path.join(skillsRoot, "build-skill-cosmos", "references", "review-contract.md");
    fs.rmSync(missing);
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /referenced file is missing: references\/review-contract\.md/,
    );
  });

  withSkillsCopy((skillsRoot) => {
    const skillPath = path.join(skillsRoot, "build-skill-cosmos", "SKILL.md");
    const privatePathFixture = ["C:", "Users", "private-user", "private-release-token.txt"].join("/");
    fs.appendFileSync(skillPath, `\nRead ${privatePathFixture} before publishing.\n`);
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /contains an absolute user path/,
    );
  });
});

test("validation binds every CLI-facing Skill to the current compatibility family", () => {
  withSkillsCopy((skillsRoot) => {
    const contractPath = path.join(skillsRoot, "customize-skill-cosmos", "references", "cli-contract.md");
    const original = fs.readFileSync(contractPath, "utf8");
    fs.writeFileSync(contractPath, original.replace("requires CLI `0.6.x`", "requires CLI `0.5.x`"));
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /customize-skill-cosmos release\/CLI compatibility contract is stale/,
    );
  });

  withSkillsCopy((skillsRoot) => {
    const skillPath = path.join(skillsRoot, "manage-skill-cosmos", "SKILL.md");
    const original = fs.readFileSync(skillPath, "utf8");
    fs.writeFileSync(skillPath, original.replace("require version `0.6.x`", "require version `0.5.x`"));
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /manage-skill-cosmos CLI compatibility family is stale/,
    );
  });

  withSkillsCopy((skillsRoot) => {
    const contractPath = path.join(skillsRoot, "customize-skill-cosmos", "references", "cli-contract.md");
    const original = fs.readFileSync(contractPath, "utf8");
    fs.writeFileSync(
      contractPath,
      original.replace("node node_modules/silent-orbit-skills-library/scripts/silent-orbit.mjs", "silent-orbit-from-missing-package"),
    );
    assert.throws(
      () => validateAgentSkills({ rootDir: projectDir, skillsRoot }),
      /customize-skill-cosmos must resolve the already-installed project-local CLI/,
    );
  });
});
