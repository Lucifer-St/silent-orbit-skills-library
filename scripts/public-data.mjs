export function buildPublicData({
  skills,
  libraries,
  categoryUnits,
  personalSkills,
  changes,
  starredSkills,
  relations,
  skillDetails,
  maintenanceStatus,
}) {
  const publicSkills = skills.filter((skill) => skill.visibility !== "local-only");
  const skillNames = new Set(publicSkills.map((skill) => skill.name));

  const publicLibraries = libraries
    .map((library) => ({
      ...library,
      skills: library.skills.filter((name) => skillNames.has(name)),
    }))
    .filter((library) => library.skills.length > 0);
  const libraryKeys = new Set(publicLibraries.map((library) => library.key));

  const publicCategoryUnits = categoryUnits
    .map((group) => {
      const units = group.units
        .map((unit) => {
          const visibleSkills = unit.skills.filter((name) => skillNames.has(name));
          return { ...unit, skills: visibleSkills, skill_count: visibleSkills.length };
        })
        .filter((unit) => unit.skills.length > 0);
      const visibleNames = new Set([
        ...units.flatMap((unit) => unit.skills),
        ...publicSkills.filter((skill) => skill.category === group.category).map((skill) => skill.name),
      ]);
      return { ...group, units, skill_count: visibleNames.size };
    })
    .filter((group) => group.skill_count > 0);
  const categoryNames = new Set(publicCategoryUnits.map((group) => group.category));

  const endpointIsPublic = (endpoint) => {
    if (!endpoint || typeof endpoint !== "object") return false;
    if (endpoint.type === "skill") return skillNames.has(endpoint.id);
    if (endpoint.type === "library") return libraryKeys.has(endpoint.id);
    if (endpoint.type === "category") return categoryNames.has(endpoint.id);
    return false;
  };

  return {
    skills: publicSkills,
    libraries: publicLibraries,
    categoryUnits: publicCategoryUnits,
    personalSkills: personalSkills.filter((skill) => skillNames.has(skill.name) && skill.visibility !== "local-only"),
    changes: changes.filter((change) => change.visibility !== "local-only" && (!change.skill || skillNames.has(change.skill))),
    starredSkills: starredSkills.filter((record) => skillNames.has(record.skill)),
    relations: relations.filter((relation) => endpointIsPublic(relation.source) && endpointIsPublic(relation.target)),
    skillDetails: skillDetails.filter((detail) => skillNames.has(detail.skill)),
    maintenanceStatus,
  };
}

export function deriveCategorySkillNames(skills, categoryUnits) {
  return Object.fromEntries(categoryUnits.map((group) => {
    const names = new Set([
      ...group.units.flatMap((unit) => unit.skills),
      ...skills.filter((skill) => skill.category === group.category).map((skill) => skill.name),
    ]);
    return [group.category, [...names].sort((left, right) => left.localeCompare(right, "en"))];
  }));
}

const PUBLIC_SKILL_FIELDS = [
  "name",
  "description",
  "trigger",
  "category",
  "library_key",
  "library_title",
  "repo",
  "repo_url",
  "origin",
  "visibility",
  "description_i18n",
];

const PUBLIC_LIBRARY_FIELDS = [
  "key",
  "title",
  "kind",
  "kind_label",
  "source_label",
  "source_url",
  "description",
  "skills",
  "repos",
  "plugins",
  "categories",
  "primary_category",
];

function pickDefined(record, fields) {
  return Object.fromEntries(fields
    .filter((field) => Object.hasOwn(record, field) && record[field] !== undefined)
    .map((field) => [field, record[field]]));
}

export function buildPublicReleaseData(input) {
  const filtered = buildPublicData(input);
  const skills = filtered.skills.map((skill) => pickDefined(skill, PUBLIC_SKILL_FIELDS));
  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));

  return {
    skills,
    libraries: filtered.libraries.map((library) => pickDefined(library, PUBLIC_LIBRARY_FIELDS)),
    categoryUnits: filtered.categoryUnits.map((group) => ({
      category: group.category,
      skill_count: group.skill_count,
      units: group.units.map((unit) => pickDefined(unit, ["type", "title", "kind", "skill_count", "skills"])),
    })),
    personalSkills: filtered.personalSkills
      .map((skill) => skillsByName.get(skill.name))
      .filter(Boolean),
    changes: filtered.changes.map((change) => pickDefined(change, [
      "id",
      "date",
      "type",
      "title",
      "summary",
      "title_i18n",
      "summary_i18n",
      "skill",
      "visibility",
    ])),
    starredSkills: filtered.starredSkills.map((record) => pickDefined(record, ["skill", "tier"])),
    relations: filtered.relations,
    skillDetails: filtered.skillDetails.map((detail) => pickDefined(detail, [
      "skill",
      "author",
      "sourceSummary",
      "sourceUrl",
      "examples",
    ])),
    maintenanceStatus: {
      schemaVersion: filtered.maintenanceStatus.schemaVersion,
      snapshotDate: filtered.maintenanceStatus.snapshotDate,
      privacy: "sanitized",
      catalogSkills: skills.length,
      publicGlobalSkills: filtered.maintenanceStatus.publicGlobalSkills,
      publicationHandoff: pickDefined(filtered.maintenanceStatus.publicationHandoff ?? {}, [
        "productionAuthority",
        "publicRepository",
        "requiredCheck",
        "deployProvider",
        "directPrivateProductionDeploy",
      ]),
      channels: (filtered.maintenanceStatus.channels ?? []).map((channel) => pickDefined(channel, [
        "id",
        "state",
        "checkedSources",
        "execution",
      ])),
      handoffPrompt: filtered.maintenanceStatus.handoffPrompt,
    },
  };
}
