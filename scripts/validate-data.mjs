import fs from "node:fs";
import path from "node:path";
import { isFlatPublicLayout, projectDir, resolveDataDir } from "./project-layout.mjs";

const sourceDir = resolveDataDir(projectDir);
const flatPublicLayout = isFlatPublicLayout(projectDir);

const failures = [];

function readRequiredArray(fileName) {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) {
    failures.push(`${fileName} must exist as an explicit data input.`);
    return [];
  }

  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(value)) {
      failures.push(`${fileName} must contain a JSON array.`);
      return [];
    }
    return value;
  } catch (error) {
    failures.push(`${fileName} must contain valid JSON: ${error.message}`);
    return [];
  }
}

const skills = JSON.parse(fs.readFileSync(path.join(sourceDir, "skills.json"), "utf8"));
const libraries = JSON.parse(fs.readFileSync(path.join(sourceDir, "libraries.json"), "utf8"));
const categoryUnits = JSON.parse(fs.readFileSync(path.join(sourceDir, "category-units.json"), "utf8"));
const personalSkills = JSON.parse(fs.readFileSync(path.join(sourceDir, "personal-skills.json"), "utf8"));
const changes = readRequiredArray("changes.json");
const starredSkills = readRequiredArray("starred-skills.json");
const relations = readRequiredArray("relations.json");
const skillDetails = readRequiredArray("skill-details.json");
const maintenanceStatus = readRequiredObject("maintenance-status.json");

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const skillNames = new Set(skills.map((skill) => skill.name));
const libraryKeys = new Set(libraries.map((library) => library.key));
const categoryNames = new Set(categoryUnits.map((category) => category.category));
const allowedOrigins = new Set(["third-party", "creator", "system", "unknown"]);
const allowedVisibilities = new Set(["public", "creator-showcase", "local-only"]);

assert(skills.length > 0, "skills.json must contain skills.");
assert(skillNames.size === skills.length, "skills.json must not contain duplicate names.");
assert(libraries.length > 0, "libraries.json must contain libraries.");
assert(categoryUnits.length > 0, "category-units.json must contain functional categories.");

for (const skill of skills) {
  assert(skill.name, "Every skill needs a name.");
  assert(skill.category, `Skill ${skill.name} is missing category.`);
  assert(skill.trigger, `Skill ${skill.name} is missing trigger.`);
  assert(allowedOrigins.has(skill.origin), `Skill ${skill.name} has invalid origin ${skill.origin}.`);
  assert(allowedVisibilities.has(skill.visibility), `Skill ${skill.name} has invalid visibility ${skill.visibility}.`);
  assert(!Object.hasOwn(skill, "is_user_created"), `Skill ${skill.name} still uses legacy is_user_created metadata.`);
  if (skill.library_key) {
    assert(libraryKeys.has(skill.library_key), `Skill ${skill.name} points to missing library ${skill.library_key}.`);
  }
}

for (const category of categoryUnits) {
  assert(category.category, "Every category unit group needs a category.");
  assert(Array.isArray(category.units), `Category ${category.category} must contain units.`);
  for (const unit of category.units) {
    assert(unit.title, `Unit in ${category.category} needs a title.`);
    assert(Array.isArray(unit.skills) && unit.skills.length > 0, `Unit ${unit.title} needs skills.`);
    for (const name of unit.skills) {
      assert(skillNames.has(name), `Unit ${unit.title} references missing skill ${name}.`);
    }
  }
}

const changeIds = new Set();
for (const change of changes) {
  assert(change && typeof change === "object" && !Array.isArray(change), "Every change record must be an object.");
  if (!change || typeof change !== "object" || Array.isArray(change)) continue;
  assert(typeof change.id === "string" && change.id.length > 0, "Every change record needs an id.");
  assert(typeof change.title === "string" && change.title.length > 0, `Change ${change.id ?? "<unknown>"} needs a title.`);
  if (typeof change.id === "string" && change.id.length > 0) {
    assert(!changeIds.has(change.id), `Duplicate change id: ${change.id}.`);
    changeIds.add(change.id);
  }
  if (change.date !== undefined) assert(typeof change.date === "string", `Change ${change.id ?? "<unknown>"} date must be a string.`);
  if (change.type !== undefined) assert(typeof change.type === "string", `Change ${change.id ?? "<unknown>"} type must be a string.`);
  if (change.summary !== undefined) assert(typeof change.summary === "string", `Change ${change.id ?? "<unknown>"} summary must be a string.`);
}

for (const starred of starredSkills) {
  assert(starred && typeof starred === "object" && !Array.isArray(starred), "Every starred skill record must be an object.");
  if (!starred || typeof starred !== "object" || Array.isArray(starred)) continue;
  assert(typeof starred.skill === "string" && starred.skill.length > 0, "Every starred skill record needs a skill name.");
  if (typeof starred.skill === "string" && starred.skill.length > 0) {
    assert(skillNames.has(starred.skill), `starred-skills.json references missing skill ${starred.skill}.`);
  }
}

function readRequiredObject(fileName) {
  const filePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(filePath)) {
    failures.push(`${fileName} must exist as an explicit data input.`);
    return {};
  }

  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      failures.push(`${fileName} must contain a JSON object.`);
      return {};
    }
    return value;
  } catch (error) {
    failures.push(`${fileName} must contain valid JSON: ${error.message}`);
    return {};
  }
}

assert(skillDetails.length <= skills.length, `skill-details.json cannot contain more records than skills.json, saw ${skillDetails.length}.`);
const detailSkillNames = new Set();
for (const detail of skillDetails) {
  assert(detail && typeof detail === "object" && !Array.isArray(detail), "Every skill detail record must be an object.");
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
  assert(typeof detail.skill === "string" && skillNames.has(detail.skill), `skill-details.json references missing skill ${detail.skill}.`);
  if (typeof detail.skill === "string") {
    assert(!detailSkillNames.has(detail.skill), `skill-details.json contains duplicate skill ${detail.skill}.`);
    detailSkillNames.add(detail.skill);
  }
  assert(typeof detail.author === "string" && detail.author.length > 0, `Skill detail ${detail.skill} needs author.`);
  assert(typeof detail.sourceSummary === "string" && detail.sourceSummary.length > 0, `Skill detail ${detail.skill} needs sourceSummary.`);
  assert(/^https:\/\//.test(detail.sourceUrl), `Skill detail ${detail.skill} needs an https sourceUrl.`);
  assert(Array.isArray(detail.examples), `Skill detail ${detail.skill} examples must be an array.`);
  if (!Array.isArray(detail.examples)) continue;
  for (const example of detail.examples) {
    assert(example && typeof example === "object" && !Array.isArray(example), `Skill detail ${detail.skill} example must be an object.`);
    if (!example || typeof example !== "object" || Array.isArray(example)) continue;
    assert(typeof example.title === "string" && example.title.length > 0, `Skill detail ${detail.skill} example needs title.`);
    assert(/^https:\/\//.test(example.url), `Skill detail ${detail.skill} example needs an https URL.`);
  }
}

const traceableIds = {
  skill: skillNames,
  library: libraryKeys,
  category: categoryNames,
};

function validateRelationEndpoint(relationId, endpointName, endpoint) {
  assert(endpoint && typeof endpoint === "object" && !Array.isArray(endpoint), `Relation ${relationId} ${endpointName} must be an object.`);
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return;
  assert(Object.hasOwn(traceableIds, endpoint.type), `Relation ${relationId} ${endpointName} has unsupported type ${endpoint.type}.`);
  assert(typeof endpoint.id === "string" && endpoint.id.length > 0, `Relation ${relationId} ${endpointName} needs an id.`);
  const ids = traceableIds[endpoint.type];
  if (ids && typeof endpoint.id === "string" && endpoint.id.length > 0) {
    assert(ids.has(endpoint.id), `Relation ${relationId} ${endpointName} references missing ${endpoint.type} ${endpoint.id}.`);
  }
}

const relationIds = new Set();
for (const relation of relations) {
  assert(relation && typeof relation === "object" && !Array.isArray(relation), "Every relation record must be an object.");
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) continue;
  const relationId = typeof relation.id === "string" && relation.id.length > 0 ? relation.id : "<unknown>";
  assert(relationId !== "<unknown>", "Every relation record needs an id.");
  if (relationId !== "<unknown>") {
    assert(!relationIds.has(relationId), `Duplicate relation id: ${relationId}.`);
    relationIds.add(relationId);
  }
  assert(typeof relation.relation === "string" && relation.relation.length > 0, `Relation ${relationId} needs a relation type.`);
  validateRelationEndpoint(relationId, "source", relation.source);
  validateRelationEndpoint(relationId, "target", relation.target);
}

const activeGlobalSkills = skills.filter((skill) => skill.status === "全局已安装");
const activeGlobalNames = new Set(activeGlobalSkills.map((skill) => skill.name));
if (!flatPublicLayout) {
  assert(activeGlobalSkills.length > 0, "skills.json must contain at least one active global Skill.");
  assert(activeGlobalNames.size === activeGlobalSkills.length, "Active global Skills must have unique names.");
  for (const skill of activeGlobalSkills) {
    assert(skill.visibility !== "local-only", `Public catalog must not contain local-only global Skill ${skill.name}.`);
  }
}
const globalMegaUnits = categoryUnits.flatMap((category) =>
  category.units
    .filter((unit) => unit.type === "library" && /^global$/i.test(unit.title) && unit.skill_count > 1)
    .map((unit) => `${category.category}/${unit.title}`),
);
assert(globalMegaUnits.length === 0, `global fallback source must not appear as a merged ability unit: ${globalMegaUnits.join(", ")}`);

const personalLibrary = libraries.find((library) => library.key === "personal:deck");
assert(Boolean(personalLibrary), "personal:deck library must exist.");
for (const skill of personalSkills) {
  assert(skill.library_key === "personal:deck", `Personal deck skill ${skill.name} must use personal:deck as its library.`);
  assert(skillNames.has(skill.name), `personal-skills.json references missing skill ${skill.name}.`);
}

const aihot = skills.find((skill) => skill.name === "aihot");
if (aihot) {
  assert(aihot.origin === "third-party", "aihot must be classified as third-party, not creator-owned.");
  assert(aihot.visibility === "public", "aihot must remain public in the shareable profile while active.");
}
for (const creatorSkillName of ["fengxue", "fengxue-ai-weekly"]) {
  const creatorSkill = skills.find((skill) => skill.name === creatorSkillName);
  if (!creatorSkill) continue;
  assert(creatorSkill.origin === "creator", `${creatorSkillName} must be classified as creator-built.`);
  assert(creatorSkill.visibility === "creator-showcase", `${creatorSkillName} must use creator-showcase visibility.`);
}

const allowedMaintenanceStates = new Set(["unchecked", "current", "update-available", "external", "system-managed", "error"]);
const allowedMaintenanceExecutions = new Set(["local-codex", "codex-runtime"]);
assert(maintenanceStatus.schemaVersion === 1, "maintenance-status.json schemaVersion must be 1.");
assert(maintenanceStatus.privacy === "sanitized", "maintenance-status.json must be explicitly sanitized.");
assert(/^\d{4}-\d{2}-\d{2}$/.test(maintenanceStatus.snapshotDate ?? ""), "maintenance-status.json needs a YYYY-MM-DD snapshotDate.");
assert(maintenanceStatus.catalogSkills === skills.length, "maintenance-status.json catalogSkills must match skills.json.");
if (flatPublicLayout) {
  assert(Number.isInteger(maintenanceStatus.publicGlobalSkills) && maintenanceStatus.publicGlobalSkills > 0, "maintenance-status.json needs a positive sanitized publicGlobalSkills count.");
} else {
  assert(maintenanceStatus.publicGlobalSkills === activeGlobalSkills.length, "maintenance-status.json publicGlobalSkills must match the public catalog.");
}
assert(Array.isArray(maintenanceStatus.channels) && maintenanceStatus.channels.length > 0, "maintenance-status.json needs update channels.");
const maintenanceChannelIds = new Set();
for (const channel of maintenanceStatus.channels ?? []) {
  assert(typeof channel.id === "string" && channel.id.length > 0, "Every maintenance channel needs an id.");
  assert(!maintenanceChannelIds.has(channel.id), `Duplicate maintenance channel id: ${channel.id}.`);
  maintenanceChannelIds.add(channel.id);
  assert(allowedMaintenanceStates.has(channel.state), `Maintenance channel ${channel.id} has invalid state ${channel.state}.`);
  assert(allowedMaintenanceExecutions.has(channel.execution), `Maintenance channel ${channel.id} has invalid execution ${channel.execution}.`);
}
assert(typeof maintenanceStatus.handoffPrompt?.["zh-CN"] === "string", "maintenance-status.json needs a Chinese handoff prompt.");
assert(typeof maintenanceStatus.handoffPrompt?.["en-US"] === "string", "maintenance-status.json needs an English handoff prompt.");
const maintenancePayload = JSON.stringify(maintenanceStatus);
assert(!/[A-Za-z]:\\Users\\|\/Users\/|"task_count"\s*:|"visibility"\s*:\s*"local-only"/.test(maintenancePayload), "maintenance-status.json must not expose private paths, usage counts, or local-only records.");

if (failures.length > 0) {
  console.error("Data validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  [
    "Data validation passed.",
    `skills=${skills.length}`,
    `libraries=${libraries.length}`,
    `categories=${categoryUnits.length}`,
    `activeGlobalSkills=${flatPublicLayout ? maintenanceStatus.publicGlobalSkills : activeGlobalSkills.length}`,
    `personalSkills=${personalSkills.length}`,
    `changes=${changes.length}`,
    `starredSkills=${starredSkills.length}`,
    `relations=${relations.length}`,
    `skillDetails=${skillDetails.length}`,
  ].join(" "),
);
