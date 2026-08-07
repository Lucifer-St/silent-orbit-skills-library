import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const forbiddenAuxiliaryFiles = new Set([
  "README.md",
  "INSTALLATION_GUIDE.md",
  "QUICK_REFERENCE.md",
  "CHANGELOG.md",
]);

function normalize(text) {
  return text.replace(/\r\n?/g, "\n");
}

function readText(filePath) {
  return normalize(fs.readFileSync(filePath, "utf8"));
}

function resolveSkillsRoot(rootDir) {
  const publicRoot = path.join(rootDir, "skills");
  if (fs.statSync(publicRoot, { throwIfNoEntry: false })?.isDirectory()) return publicRoot;
  const privateRoot = path.resolve(rootDir, "..", "..", "skills");
  if (fs.statSync(privateRoot, { throwIfNoEntry: false })?.isDirectory()) return privateRoot;
  throw new Error("Bundled Agent Skills directory is missing.");
}

function parseFrontmatter(markdown, skillName) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${skillName}: SKILL.md must begin with YAML frontmatter.`);
  const entries = match[1].split("\n").map((line) => {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!field) throw new Error(`${skillName}: frontmatter must use one-line key/value fields.`);
    return [field[1], field[2].trim()];
  });
  const keys = entries.map(([key]) => key);
  if (JSON.stringify(keys) !== JSON.stringify(["name", "description"])) {
    throw new Error(`${skillName}: frontmatter must contain only name and description, in that order.`);
  }
  return Object.fromEntries(entries);
}

function parseQuotedInterfaceYaml(yaml, skillName) {
  const lines = yaml.split("\n");
  if (lines[0] !== "interface:") throw new Error(`${skillName}: agents/openai.yaml must begin with interface:.`);
  const values = {};
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const match = line.match(/^  ([a-z_]+):\s*("(?:\\.|[^"\\])*")\s*$/);
    if (!match) throw new Error(`${skillName}: interface values must be quoted one-line strings.`);
    if (Object.hasOwn(values, match[1])) throw new Error(`${skillName}: duplicate interface field ${match[1]}.`);
    values[match[1]] = JSON.parse(match[2]);
  }
  const required = ["display_name", "short_description", "default_prompt"];
  for (const key of required) {
    if (typeof values[key] !== "string" || !values[key].trim()) {
      throw new Error(`${skillName}: agents/openai.yaml is missing ${key}.`);
    }
  }
  return values;
}

function validateRelativeReferences(markdown, skillDir, skillName) {
  const references = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:https?:|#)/i.test(target));
  for (const target of references) {
    if (target.includes("..")) throw new Error(`${skillName}: reference traversal is forbidden: ${target}.`);
    const resolved = path.resolve(skillDir, ...target.split("/"));
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${skillName}: referenced file is missing: ${target}.`);
    }
  }
  return references.length;
}

function walkFiles(rootDir, relative = "") {
  return fs.readdirSync(path.join(rootDir, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      return entry.isDirectory() ? walkFiles(rootDir, next) : [next];
    });
}

function containsPrivateAbsolutePath(text) {
  return /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]/i.test(text)
    || /\/(?:Users|home)\//.test(text);
}

function validateSkill(skillRoot, skillName) {
  if (!skillNamePattern.test(skillName) || skillName.length > 64) {
    throw new Error(`${skillName}: folder name must be lowercase hyphen-case and at most 64 characters.`);
  }
  const skillDir = path.join(skillRoot, skillName);
  const skillPath = path.join(skillDir, "SKILL.md");
  const agentPath = path.join(skillDir, "agents", "openai.yaml");
  if (!fs.statSync(skillPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`${skillName}: SKILL.md is missing.`);
  if (!fs.statSync(agentPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`${skillName}: agents/openai.yaml is missing.`);

  const markdown = readText(skillPath);
  const frontmatter = parseFrontmatter(markdown, skillName);
  if (frontmatter.name !== skillName) throw new Error(`${skillName}: frontmatter name must match the folder name.`);
  if (frontmatter.description.length < 40 || frontmatter.description.length > 1200) {
    throw new Error(`${skillName}: description must be 40-1200 characters.`);
  }
  if (markdown.split("\n").length > 500) throw new Error(`${skillName}: SKILL.md exceeds 500 lines.`);
  if (/\bTODO\b/.test(markdown)) throw new Error(`${skillName}: unresolved TODO is forbidden.`);

  const interfaceValues = parseQuotedInterfaceYaml(readText(agentPath), skillName);
  const shortLength = [...interfaceValues.short_description].length;
  if (shortLength < 25 || shortLength > 64) {
    throw new Error(`${skillName}: short_description must be 25-64 characters.`);
  }
  if (!interfaceValues.default_prompt.includes(`$${skillName}`)) {
    throw new Error(`${skillName}: default_prompt must explicitly invoke $${skillName}.`);
  }

  const files = walkFiles(skillDir);
  for (const relativePath of files) {
    if (forbiddenAuxiliaryFiles.has(path.posix.basename(relativePath))) {
      throw new Error(`${skillName}: auxiliary file is forbidden: ${relativePath}.`);
    }
    const text = /\.(?:md|ya?ml|json|mjs|js|py|ps1|sh)$/i.test(relativePath)
      ? readText(path.join(skillDir, ...relativePath.split("/")))
      : "";
    if (!relativePath.startsWith("tests/") && containsPrivateAbsolutePath(text)) {
      throw new Error(`${skillName}: ${relativePath} contains an absolute user path.`);
    }
  }

  return {
    name: skillName,
    files: files.length,
    references: validateRelativeReferences(markdown, skillDir, skillName),
    description: frontmatter.description,
    defaultPrompt: interfaceValues.default_prompt,
  };
}

function validateCompatibility({ rootDir, skillRoot, packageVersion }) {
  const cliSource = readText(path.join(rootDir, "scripts", "silent-orbit.mjs"));
  const cliVersion = cliSource.match(/export const silentOrbitVersion = "([^"]+)";/)?.[1];
  if (!cliVersion) throw new Error("Unable to resolve the Silent Orbit CLI interface version.");
  const [cliMajor, cliMinor] = cliVersion.split(".");

  const buildContract = readText(path.join(skillRoot, "build-skill-cosmos", "references", "cli-contract.md"));
  if (!buildContract.includes(`package \`${packageVersion}\` contains CLI \`${cliVersion}\``)) {
    throw new Error("build-skill-cosmos CLI contract is stale for the current package/CLI versions.");
  }
  if (!buildContract.includes(`require version \`${cliMajor}.${cliMinor}.x\``)) {
    throw new Error("build-skill-cosmos CLI compatibility family is stale.");
  }

  const customizeContract = readText(path.join(skillRoot, "customize-skill-cosmos", "references", "cli-contract.md"));
  if (!customizeContract.includes(`prerelease \`v${packageVersion}\` requires CLI \`${cliMajor}.${cliMinor}.x\``)) {
    throw new Error("customize-skill-cosmos release/CLI compatibility contract is stale.");
  }

  const auditSkill = readText(path.join(skillRoot, "audit-skill-cosmos", "SKILL.md"));
  if (!auditSkill.includes(`require version \`${cliMajor}.${cliMinor}.x\``)) {
    throw new Error("audit-skill-cosmos CLI compatibility family is stale.");
  }
  const manageSkill = readText(path.join(skillRoot, "manage-skill-cosmos", "SKILL.md"));
  if (!manageSkill.includes(`require version \`${cliMajor}.${cliMinor}.x\``)) {
    throw new Error("manage-skill-cosmos CLI compatibility family is stale.");
  }

  const cliFacingSkills = new Map([
    ["build-skill-cosmos", buildContract],
    ["audit-skill-cosmos", auditSkill],
    ["customize-skill-cosmos", customizeContract],
    ["manage-skill-cosmos", manageSkill],
  ]);
  for (const [skillName, contract] of cliFacingSkills) {
    if (!contract.includes("node node_modules/silent-orbit-skills-library/scripts/silent-orbit.mjs")
      || !/workspace root/i.test(contract)) {
      throw new Error(`${skillName} must resolve the already-installed project-local CLI up to the workspace root.`);
    }
    if (!/(?:npx[\s\S]{0,100}(?:download|auto-install)|(?:download|auto-install)[\s\S]{0,100}npx)/i.test(contract)) {
      throw new Error(`${skillName} must forbid an auto-installing npx fallback.`);
    }
  }
  return cliVersion;
}

export function validateAgentSkills({ rootDir = projectDir, skillsRoot } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedSkillsRoot = skillsRoot ? path.resolve(skillsRoot) : resolveSkillsRoot(resolvedRoot);
  const packageJson = JSON.parse(fs.readFileSync(path.join(resolvedRoot, "package.json"), "utf8"));
  const expectedNames = (packageJson.files ?? [])
    .map((entry) => entry.match(/^skills\/([^/]+)$/)?.[1])
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (expectedNames.length === 0) throw new Error("package.json does not declare bundled Agent Skills.");
  if (new Set(expectedNames).size !== expectedNames.length) throw new Error("package.json contains duplicate Agent Skill entries.");

  const actualNames = fs.readdirSync(resolvedSkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Bundled Agent Skill directories do not match package.json: ${actualNames.join(", ")}.`);
  }

  const skills = expectedNames.map((name) => validateSkill(resolvedSkillsRoot, name));
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  if (!byName.get("audit-skill-cosmos")?.description.includes("HealthReportV1")
    || !byName.get("audit-skill-cosmos")?.description.includes("skills-library-maintenance")) {
    throw new Error("audit-skill-cosmos must route project HealthReportV1 work away from lifecycle maintenance.");
  }
  if (!byName.get("skills-library-maintenance")?.description.includes("audit-skill-cosmos")) {
    throw new Error("skills-library-maintenance must route read-only project health reports to audit-skill-cosmos.");
  }
  const auditPrompt = byName.get("audit-skill-cosmos")?.defaultPrompt ?? "";
  if (!/HealthReportV1|configured Silent Orbit project/i.test(auditPrompt)
    || /global|install|update|remove|lifecycle/i.test(auditPrompt)) {
    throw new Error("audit-skill-cosmos default_prompt must stay scoped to HealthReportV1 or one configured project.");
  }

  const cliVersion = validateCompatibility({
    rootDir: resolvedRoot,
    skillRoot: resolvedSkillsRoot,
    packageVersion: packageJson.version,
  });
  const result = {
    packageVersion: packageJson.version,
    cliVersion,
    skills: skills.length,
    files: skills.reduce((sum, skill) => sum + skill.files, 0),
    references: skills.reduce((sum, skill) => sum + skill.references, 0),
  };
  console.log(`Agent Skill validation passed. package=${result.packageVersion} cli=${result.cliVersion} skills=${result.skills} files=${result.files} references=${result.references}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateAgentSkills();
}
