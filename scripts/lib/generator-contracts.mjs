import { createHash } from "node:crypto";

const VISIBILITIES = new Set(["public", "creator-showcase", "local-only", "review-required"]);
const PUBLIC_VISIBILITIES = new Set(["public", "creator-showcase"]);
const ORIGINS = new Set(["third-party", "creator", "system", "unknown"]);
const LOCALES = new Set(["zh-CN", "en-US"]);
const SECRET_PREFIXES = [
  ["github", "pat"].join("_") + "_",
  ["gh", "p_"].join(""),
];
const LONG_SECRET_PATTERN = new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9_-]{12,}`, "i");

function invariant(condition, message) {
  if (!condition) throw new Error(`Generator contract violation: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function stableToken(namespace, value) {
  const readable = String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "record";
  const digest = createHash("sha256").update(`${namespace}\u0000${value}`).digest("hex").slice(0, 12);
  return `${namespace}:${readable}:${digest}`;
}

export function createContentId(namespace, value) {
  return stableToken(namespace, value);
}

export function createSourceId(libraryKey) {
  return stableToken("source", libraryKey);
}

export function createLibraryId(libraryKey) {
  return stableToken("library", libraryKey);
}

export function createSkillId(libraryKey, skillName) {
  return stableToken("skill", `${libraryKey}\u0000${skillName}`);
}

export function createCategoryId(categoryName) {
  return stableToken("category", categoryName);
}

function compareById(left, right) {
  return left.id.localeCompare(right.id, "en");
}

export function createInventorySnapshotV1({ projectId, generatedAt, sources, items, diagnostics = [] }) {
  const sortedSources = [...sources].sort(compareById);
  const sortedItems = [...items].sort(compareById);
  const sortedDiagnostics = [...diagnostics].sort(compareById);
  const body = {
    schemaVersion: 1,
    projectId,
    generatedAt,
    privacy: "sanitized",
    sources: sortedSources,
    items: sortedItems,
    diagnostics: sortedDiagnostics,
    summary: {
      sources: sortedSources.length,
      items: sortedItems.length,
      warnings: sortedDiagnostics.filter((entry) => entry.severity === "warning").length,
      errors: sortedDiagnostics.filter((entry) => entry.severity === "error").length,
    },
  };
  return validateInventorySnapshotV1({
    ...body,
    snapshotId: stableToken("inventory-snapshot", JSON.stringify(body)),
  });
}

export function createLibrarySnapshotV1({ projectId, generatedAt, skills, libraries, categories, units, categoryMemberships, collections = [], changes = [], starredSkills = [], relations = [], skillDetails = [], maintenanceStatus }) {
  const body = {
    schemaVersion: 1,
    projectId,
    generatedAt,
    skills: [...skills],
    libraries: [...libraries],
    categories: [...categories],
    units: [...units],
    categoryMemberships: [...categoryMemberships].sort((left, right) =>
      left.categoryId.localeCompare(right.categoryId, "en") || left.skillId.localeCompare(right.skillId, "en")),
    collections: [...collections],
    changes: [...changes],
    starredSkills: [...starredSkills],
    relations: [...relations],
    skillDetails: [...skillDetails],
    maintenanceStatus,
  };
  return validateLibrarySnapshotV1({
    ...body,
    snapshotId: stableToken("library-snapshot", JSON.stringify(body)),
  });
}

export function createSiteManifestV1({ projectConfig, inventorySnapshot, librarySnapshot }) {
  return validateSiteManifestV1({
    schemaVersion: 1,
    projectId: projectConfig.projectId,
    generatedAt: librarySnapshot.generatedAt,
    snapshotRefs: { inventory: inventorySnapshot.snapshotId, library: librarySnapshot.snapshotId },
    renderer: projectConfig.renderer,
    locales: projectConfig.locales,
    summary: {
      skills: librarySnapshot.skills.length,
      libraries: librarySnapshot.libraries.length,
      categories: librarySnapshot.categories.length,
      collections: librarySnapshot.collections.length,
    },
    privacy: { includesLocalOnly: false, publicVisibilities: projectConfig.privacy.publicVisibilities },
  }, { projectConfig, inventorySnapshot, librarySnapshot });
}

function resolveLegacyLibrary(unit, libraries) {
  return libraries.find((library) => {
    if (unit.page && library.page === unit.page) return true;
    if (library.skills.length === unit.skills.length && unit.skills.every((name) => library.skills.includes(name))) return true;
    return library.title === unit.title;
  });
}

function validateUniqueIds(records, label) {
  const ids = records.map((record) => record.id);
  invariant(ids.every((id) => typeof id === "string" && id.length > 0), `${label} needs stable string ids.`);
  invariant(new Set(ids).size === ids.length, `${label} contains duplicate ids.`);
}

function validateAllowedKeys(record, keys, label) {
  invariant(isRecord(record), `${label} must be an object.`);
  const unexpected = Object.keys(record).filter((key) => !keys.includes(key));
  invariant(unexpected.length === 0, `${label} contains unsupported fields: ${unexpected.join(", ")}.`);
}

export function validateProjectConfigV1(config) {
  invariant(isRecord(config), "ProjectConfigV1 must be an object.");
  invariant(config.schemaVersion === 1, "ProjectConfigV1.schemaVersion must be 1.");
  invariant(typeof config.projectId === "string" && config.projectId.length > 0, "ProjectConfigV1.projectId is required.");
  invariant(isRecord(config.title) && typeof config.title["en-US"] === "string", "ProjectConfigV1 needs an English title.");
  invariant(Array.isArray(config.locales) && config.locales.length > 0, "ProjectConfigV1.locales must be non-empty.");
  invariant(config.locales.every((locale) => LOCALES.has(locale)), "ProjectConfigV1 contains an unsupported locale.");
  invariant(config.locales.includes(config.defaultLocale), "ProjectConfigV1.defaultLocale must be enabled.");
  invariant(isRecord(config.privacy), "ProjectConfigV1.privacy is required.");
  invariant(Array.isArray(config.privacy.publicVisibilities), "ProjectConfigV1.privacy.publicVisibilities must be an array.");
  invariant(config.privacy.publicVisibilities.every((value) => PUBLIC_VISIBILITIES.has(value)), "Public visibility policy can include only public and creator-showcase records.");
  invariant(VISIBILITIES.has(config.privacy.defaultVisibility), "ProjectConfigV1 has an invalid default visibility.");
  invariant(config.privacy.publishRawPaths === false, "ProjectConfigV1 must forbid raw path publication.");
  return config;
}

export function validateInventorySnapshotV1(snapshot) {
  invariant(isRecord(snapshot), "InventorySnapshotV1 must be an object.");
  validateAllowedKeys(snapshot, ["schemaVersion", "snapshotId", "projectId", "generatedAt", "privacy", "sources", "items", "diagnostics", "summary"], "InventorySnapshotV1");
  invariant(snapshot.schemaVersion === 1, "InventorySnapshotV1.schemaVersion must be 1.");
  invariant(typeof snapshot.snapshotId === "string" && snapshot.snapshotId.length > 0, "InventorySnapshotV1.snapshotId is required.");
  invariant(typeof snapshot.projectId === "string" && snapshot.projectId.length > 0, "InventorySnapshotV1.projectId is required.");
  invariant(typeof snapshot.generatedAt === "string" && !Number.isNaN(Date.parse(snapshot.generatedAt)), "InventorySnapshotV1.generatedAt must be an ISO timestamp.");
  invariant(snapshot.privacy === "sanitized", "InventorySnapshotV1 must be sanitized.");
  invariant(Array.isArray(snapshot.sources) && Array.isArray(snapshot.items) && Array.isArray(snapshot.diagnostics), "InventorySnapshotV1 needs sources, items, and diagnostics.");
  validateUniqueIds(snapshot.sources, "InventorySnapshotV1.sources");
  validateUniqueIds(snapshot.items, "InventorySnapshotV1.items");
  validateUniqueIds(snapshot.diagnostics, "InventorySnapshotV1.diagnostics");
  const sourceIds = new Set(snapshot.sources.map((source) => source.id));
  const itemIds = new Set(snapshot.items.map((item) => item.id));
  for (const source of snapshot.sources) {
    validateAllowedKeys(source, ["id", "providerKind", "label", "sourceUrl", "scanState", "capabilities"], `Inventory source ${source.id}`);
    invariant(["complete", "partial", "failed"].includes(source.scanState), `Inventory source ${source.id} has invalid scanState.`);
    invariant(isRecord(source.capabilities), `Inventory source ${source.id} needs capabilities.`);
    validateAllowedKeys(source.capabilities, ["discovery", "write", "updateChannel"], `Inventory source ${source.id}.capabilities`);
    invariant(source.capabilities.discovery === "read-only" && source.capabilities.write === false, `Inventory source ${source.id} must be read-only.`);
    invariant(["source-managed", "external", "system-managed", "unknown"].includes(source.capabilities.updateChannel), `Inventory source ${source.id} has invalid update channel.`);
    if (source.sourceUrl !== undefined) invariant(/^https?:\/\//i.test(source.sourceUrl), `Inventory source ${source.id} has a non-public URL.`);
  }
  for (const item of snapshot.items) {
    validateAllowedKeys(item, ["id", "kind", "name", "sourceId", "state", "origin", "visibility", "status", "observed"], `Inventory item ${item.id}`);
    invariant(item.kind === "skill", `Inventory item ${item.id} has unsupported kind.`);
    invariant(sourceIds.has(item.sourceId), `Inventory item ${item.id} references a missing source.`);
    invariant(VISIBILITIES.has(item.visibility), `Inventory item ${item.id} has invalid visibility.`);
    invariant(item.visibility !== "local-only", `Sanitized inventory contains local-only item ${item.id}.`);
    invariant(ORIGINS.has(item.origin), `Inventory item ${item.id} has invalid origin.`);
    invariant(!Object.hasOwn(item, "path") && !Object.hasOwn(item, "hash"), `Inventory item ${item.id} exposes private evidence.`);
    if (item.visibility === "creator-showcase") invariant(item.origin === "creator", `Creator showcase item ${item.id} must have creator origin.`);
    if (item.observed !== undefined) {
      invariant(isRecord(item.observed), `Inventory item ${item.id}.observed must be an object.`);
      validateAllowedKeys(item.observed, ["description", "trigger", "version", "author", "sourceUrl"], `Inventory item ${item.id}.observed`);
      if (item.observed.sourceUrl !== undefined) invariant(/^https?:\/\//i.test(item.observed.sourceUrl), `Inventory item ${item.id} has a non-public source URL.`);
    }
  }
  for (const diagnostic of snapshot.diagnostics) {
    validateAllowedKeys(diagnostic, ["id", "sourceId", "itemId", "severity", "code", "message"], `Inventory diagnostic ${diagnostic.id}`);
    invariant(sourceIds.has(diagnostic.sourceId), `Inventory diagnostic ${diagnostic.id} references a missing source.`);
    invariant(["warning", "error"].includes(diagnostic.severity), `Inventory diagnostic ${diagnostic.id} has invalid severity.`);
    if (diagnostic.itemId !== undefined) invariant(itemIds.has(diagnostic.itemId), `Inventory diagnostic ${diagnostic.id} references a missing item.`);
  }
  invariant(isRecord(snapshot.summary), "InventorySnapshotV1.summary is required.");
  validateAllowedKeys(snapshot.summary, ["sources", "items", "warnings", "errors"], "InventorySnapshotV1.summary");
  invariant(snapshot.summary.sources === snapshot.sources.length, "InventorySnapshotV1 source summary is stale.");
  invariant(snapshot.summary.items === snapshot.items.length, "InventorySnapshotV1 item summary is stale.");
  invariant(snapshot.summary.warnings === snapshot.diagnostics.filter((entry) => entry.severity === "warning").length, "InventorySnapshotV1 warning summary is stale.");
  invariant(snapshot.summary.errors === snapshot.diagnostics.filter((entry) => entry.severity === "error").length, "InventorySnapshotV1 error summary is stale.");
  const serialized = JSON.stringify(snapshot);
  invariant(!/(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i.test(serialized), "Sanitized inventory contains an absolute user path.");
  invariant(!SECRET_PREFIXES.some((prefix) => serialized.includes(prefix)) && !LONG_SECRET_PATTERN.test(serialized) && !/bearer\s+[A-Za-z0-9._-]{12,}/i.test(serialized), "Sanitized inventory contains secret-like content.");
  invariant(!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized), "Sanitized inventory contains an email address.");
  return snapshot;
}

export function validateLibrarySnapshotV1(snapshot) {
  invariant(isRecord(snapshot), "LibrarySnapshotV1 must be an object.");
  invariant(snapshot.schemaVersion === 1, "LibrarySnapshotV1.schemaVersion must be 1.");
  for (const key of ["skills", "libraries", "categories", "units", "categoryMemberships", "collections"]) {
    invariant(Array.isArray(snapshot[key]), `LibrarySnapshotV1.${key} must be an array.`);
  }
  validateUniqueIds(snapshot.skills, "LibrarySnapshotV1.skills");
  validateUniqueIds(snapshot.libraries, "LibrarySnapshotV1.libraries");
  validateUniqueIds(snapshot.categories, "LibrarySnapshotV1.categories");
  validateUniqueIds(snapshot.units, "LibrarySnapshotV1.units");
  validateUniqueIds(snapshot.collections, "LibrarySnapshotV1.collections");
  const skillIds = new Set(snapshot.skills.map((skill) => skill.id));
  const libraryIds = new Set(snapshot.libraries.map((library) => library.id));
  const categoryIds = new Set(snapshot.categories.map((category) => category.id));
  const unitIds = new Set(snapshot.units.map((unit) => unit.id));
  for (const skill of snapshot.skills) {
    invariant(libraryIds.has(skill.libraryId), `Skill ${skill.id} references a missing library.`);
    invariant(PUBLIC_VISIBILITIES.has(skill.visibility), `LibrarySnapshotV1 contains a non-public Skill ${skill.id}.`);
    invariant(ORIGINS.has(skill.origin), `Skill ${skill.id} has invalid origin.`);
    if (skill.visibility === "creator-showcase") invariant(skill.origin === "creator", `Creator showcase Skill ${skill.id} must have creator origin.`);
    if (skill.primaryCategoryId !== undefined) invariant(categoryIds.has(skill.primaryCategoryId), `Skill ${skill.id} references a missing primary category.`);
    invariant(isRecord(skill.provenance), `Skill ${skill.id} needs field provenance.`);
    for (const kind of ["observed", "inferred", "curated"]) {
      invariant(Array.isArray(skill.provenance[kind]), `Skill ${skill.id} provenance.${kind} must be an array.`);
    }
  }
  for (const library of snapshot.libraries) {
    invariant(library.skillIds.every((id) => skillIds.has(id)), `Library ${library.id} references a missing Skill.`);
    invariant(library.skillIds.every((id) => snapshot.skills.find((skill) => skill.id === id)?.libraryId === library.id), `Library ${library.id} contains a Skill assigned to another library.`);
  }
  for (const category of snapshot.categories) {
    invariant(category.unitIds.every((id) => unitIds.has(id)), `Category ${category.id} references a missing unit.`);
  }
  for (const unit of snapshot.units) {
    invariant(categoryIds.has(unit.categoryId), `Unit ${unit.id} references a missing category.`);
    invariant(unit.skillIds.every((id) => skillIds.has(id)), `Unit ${unit.id} references a missing Skill.`);
    if (unit.libraryId !== undefined) invariant(libraryIds.has(unit.libraryId), `Unit ${unit.id} references a missing library.`);
  }
  const membershipKeys = new Set();
  for (const membership of snapshot.categoryMemberships) {
    invariant(categoryIds.has(membership.categoryId), "Category membership references a missing category.");
    invariant(skillIds.has(membership.skillId), "Category membership references a missing Skill.");
    invariant(Array.isArray(membership.basis) && membership.basis.length > 0, "Category membership needs evidence basis.");
    invariant(membership.basis.every((basis) => ["legacy-unit", "legacy-skill-category", "curated-override", "inferred-rule", "review-required"].includes(basis)), "Category membership has an unsupported evidence basis.");
    invariant(new Set(membership.basis).size === membership.basis.length, "Category membership evidence basis contains duplicates.");
    const key = `${membership.categoryId}\u0000${membership.skillId}`;
    invariant(!membershipKeys.has(key), `Duplicate category membership ${key}.`);
    membershipKeys.add(key);
  }
  for (const collection of snapshot.collections) {
    invariant(collection.skillIds.every((id) => skillIds.has(id)), `Collection ${collection.id} references a missing Skill.`);
  }
  for (const skill of snapshot.skills) {
    if (skill.primaryCategoryId !== undefined) invariant(membershipKeys.has(`${skill.primaryCategoryId}\u0000${skill.id}`), `Skill ${skill.id} primary category has no membership.`);
  }
  const serialized = JSON.stringify(snapshot);
  invariant(!/(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i.test(serialized), "LibrarySnapshotV1 contains an absolute user path.");
  invariant(!SECRET_PREFIXES.some((prefix) => serialized.includes(prefix)) && !LONG_SECRET_PATTERN.test(serialized) && !/bearer\s+[A-Za-z0-9._-]{12,}/i.test(serialized), "LibrarySnapshotV1 contains secret-like content.");
  invariant(!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized), "LibrarySnapshotV1 contains an email address.");
  return snapshot;
}

export function validateSiteManifestV1(manifest, { projectConfig, inventorySnapshot, librarySnapshot } = {}) {
  invariant(isRecord(manifest), "SiteManifestV1 must be an object.");
  invariant(manifest.schemaVersion === 1, "SiteManifestV1.schemaVersion must be 1.");
  invariant(isRecord(manifest.snapshotRefs), "SiteManifestV1.snapshotRefs is required.");
  invariant(isRecord(manifest.summary), "SiteManifestV1.summary is required.");
  if (projectConfig) invariant(manifest.projectId === projectConfig.projectId, "SiteManifestV1 project does not match ProjectConfigV1.");
  if (inventorySnapshot) invariant(manifest.snapshotRefs.inventory === inventorySnapshot.snapshotId, "SiteManifestV1 inventory reference is stale.");
  if (librarySnapshot) {
    invariant(manifest.snapshotRefs.library === librarySnapshot.snapshotId, "SiteManifestV1 library reference is stale.");
    invariant(manifest.summary.skills === librarySnapshot.skills.length, "SiteManifestV1 Skill summary must be derived from LibrarySnapshotV1.");
    invariant(manifest.summary.libraries === librarySnapshot.libraries.length, "SiteManifestV1 Library summary must be derived from LibrarySnapshotV1.");
    invariant(manifest.summary.categories === librarySnapshot.categories.length, "SiteManifestV1 category summary must be derived from LibrarySnapshotV1.");
  }
  invariant(manifest.privacy?.includesLocalOnly === false, "SiteManifestV1 cannot include local-only records.");
  return manifest;
}

function skillProvenance(skill) {
  const observed = ["name", "trigger", "libraryId"];
  if (skill.status !== undefined) observed.push("status");
  const inferred = skill.description ? ["description"] : [];
  const curated = ["origin", "visibility", "categoryMemberships"];
  for (const [legacy, normalized] of [["frequency", "frequency"], ["importance", "importance"], ["star_tier", "starTier"]]) {
    if (skill[legacy] !== undefined) curated.push(normalized);
  }
  return { observed, inferred, curated };
}

export function createLegacyGeneratorModel({ data, generatedAt, sourceDir }) {
  invariant(isRecord(data), "Legacy public data is required.");
  const projectConfig = validateProjectConfigV1({
    schemaVersion: 1,
    projectId: "silent-orbit-skills-library",
    title: { "zh-CN": "Silent Orbit Skills Library", "en-US": "Silent Orbit Skills Library" },
    locales: ["zh-CN", "en-US"],
    defaultLocale: "en-US",
    renderer: { theme: "silent-orbit", defaultRoute: "/" },
    privacy: {
      defaultVisibility: "public",
      publicVisibilities: ["public", "creator-showcase"],
      publishRawPaths: false,
      publishHashes: false,
      publishUsageEvidence: false,
    },
  });

  const libraryIdByKey = new Map(data.libraries.map((library) => [library.key, createLibraryId(library.key)]));
  const sourceIdByKey = new Map(data.libraries.map((library) => [library.key, createSourceId(library.key)]));
  const skillIdByName = new Map(data.skills.map((skill) => [skill.name, createSkillId(skill.library_key, skill.name)]));
  const categoryIdByName = new Map(data.categoryUnits.map((category) => [category.category, createCategoryId(category.category)]));
  invariant(skillIdByName.size === data.skills.length, "Legacy adapter requires unique Skill names during migration.");

  const sources = data.libraries.map((library) => ({
    id: sourceIdByKey.get(library.key),
    providerKind: library.kind,
    label: library.title,
    ...(library.source_url ? { sourceUrl: library.source_url } : {}),
    scanState: "complete",
    capabilities: {
      discovery: "read-only",
      write: false,
      updateChannel: library.kind === "plugin" ? "external" : library.kind === "system" ? "system-managed" : library.kind === "repo" ? "source-managed" : "unknown",
    },
  }));
  const inventorySnapshot = createInventorySnapshotV1({
    projectId: projectConfig.projectId,
    generatedAt,
    sources,
    items: data.skills.map((skill) => compactRecord({
      id: skillIdByName.get(skill.name),
      kind: "skill",
      name: skill.name,
      sourceId: sourceIdByKey.get(skill.library_key),
      state: "present",
      origin: skill.origin,
      visibility: skill.visibility,
      status: skill.status,
    })),
  });

  const libraries = data.libraries.map((library) => compactRecord({
    id: libraryIdByKey.get(library.key),
    key: library.key,
    sourceId: sourceIdByKey.get(library.key),
    title: library.title,
    kind: library.kind,
    kindLabel: library.kind_label,
    sourceLabel: library.source_label,
    sourceUrl: library.source_url,
    description: library.description,
    page: library.page,
    skillIds: library.skills.map((name) => skillIdByName.get(name)).filter(Boolean),
    repos: library.repos,
    plugins: library.plugins,
    legacyCategories: library.categories,
    legacyPrimaryCategory: library.primary_category,
    statusCounts: library.status_counts,
    highValueCount: library.high_value_count,
    starredCount: library.starred_count,
  }));

  const unitById = new Map();
  const categories = data.categoryUnits.map((group) => {
    const categoryId = categoryIdByName.get(group.category);
    const unitIds = group.units.map((unit) => {
      const legacyLibrary = resolveLegacyLibrary(unit, data.libraries);
      const unitIdentity = legacyLibrary?.key
        ? `library:${legacyLibrary.key}`
        : unit.type === "skill" && unit.skills.length === 1
          ? `skill:${unit.skills[0]}`
          : unit.page
            ? `page:${unit.page}`
            : `skills:${[...unit.skills].sort().join(",")}`;
      const id = stableToken("unit", `${group.category}\u0000${unitIdentity}`);
      invariant(!unitById.has(id), `Legacy units collide at ${group.category}/${unit.title}.`);
      unitById.set(id, compactRecord({
        id,
        categoryId,
        type: unit.type,
        title: unit.title,
        kind: unit.kind,
        page: unit.page,
        libraryId: legacyLibrary ? libraryIdByKey.get(legacyLibrary.key) : undefined,
        skillIds: unit.skills.map((name) => skillIdByName.get(name)).filter(Boolean),
      }));
      return id;
    });
    return { id: categoryId, name: group.category, unitIds };
  });

  const membershipByKey = new Map();
  function addMembership(categoryName, skillName, basis) {
    const categoryId = categoryIdByName.get(categoryName);
    const skillId = skillIdByName.get(skillName);
    if (!categoryId || !skillId) return;
    const key = `${categoryId}\u0000${skillId}`;
    const existing = membershipByKey.get(key);
    if (existing) existing.basis = unique([...existing.basis, basis]).sort();
    else membershipByKey.set(key, { categoryId, skillId, basis: [basis] });
  }
  for (const group of data.categoryUnits) {
    for (const unit of group.units) for (const skillName of unit.skills) addMembership(group.category, skillName, "legacy-unit");
  }
  for (const skill of data.skills) addMembership(skill.category, skill.name, "legacy-skill-category");
  const categoryMemberships = [...membershipByKey.values()].sort((left, right) =>
    left.categoryId.localeCompare(right.categoryId, "en") || left.skillId.localeCompare(right.skillId, "en"));

  const skills = data.skills.map((skill) => compactRecord({
    id: skillIdByName.get(skill.name),
    name: skill.name,
    description: skill.description,
    descriptionI18n: skill.description_i18n,
    trigger: skill.trigger,
    legacyCategory: skill.category,
    primaryCategoryId: categoryIdByName.get(skill.category),
    sourceId: sourceIdByKey.get(skill.library_key),
    libraryId: libraryIdByKey.get(skill.library_key),
    libraryTitle: skill.library_title,
    libraryPage: skill.library_page,
    status: skill.status,
    frequency: skill.frequency,
    importance: skill.importance,
    starTier: skill.star_tier,
    repo: skill.repo,
    repoUrl: skill.repo_url,
    skillPage: skill.skill_page,
    origin: skill.origin,
    visibility: skill.visibility,
    provenance: skillProvenance(skill),
  }));

  const personalSkillIds = data.personalSkills.map((skill) => skillIdByName.get(skill.name)).filter(Boolean);
  const collections = personalSkillIds.length > 0 ? [{
    id: "collection:personal-deck",
    kind: "personal-deck",
    title: "Personal Deck",
    skillIds: personalSkillIds,
  }] : [];
  const librarySnapshot = createLibrarySnapshotV1({
    projectId: projectConfig.projectId,
    generatedAt,
    skills,
    libraries,
    categories,
    units: [...unitById.values()],
    categoryMemberships,
    collections,
    changes: data.changes,
    starredSkills: data.starredSkills,
    relations: data.relations,
    skillDetails: data.skillDetails,
    maintenanceStatus: data.maintenanceStatus,
  });

  const appData = buildRendererViewModel({ librarySnapshot, generatedAt, sourceDir });
  const siteManifest = createSiteManifestV1({ projectConfig, inventorySnapshot, librarySnapshot });

  return { projectConfig, inventorySnapshot, librarySnapshot, siteManifest, appData };
}

export function buildRendererViewModel({ librarySnapshot, generatedAt, sourceDir }) {
  validateLibrarySnapshotV1(librarySnapshot);
  const skillsById = new Map(librarySnapshot.skills.map((skill) => [skill.id, skill]));
  const librariesById = new Map(librarySnapshot.libraries.map((library) => [library.id, library]));
  const unitsById = new Map(librarySnapshot.units.map((unit) => [unit.id, unit]));
  const nameForSkillId = (id) => skillsById.get(id)?.name;
  const skillRecord = (skill) => compactRecord({
    name: skill.name,
    description: skill.description,
    description_i18n: skill.descriptionI18n,
    trigger: skill.trigger,
    category: skill.legacyCategory,
    library_key: librariesById.get(skill.libraryId)?.key,
    library_title: skill.libraryTitle,
    library_page: skill.libraryPage,
    status: skill.status,
    frequency: skill.frequency,
    importance: skill.importance,
    star_tier: skill.starTier,
    repo: skill.repo,
    repo_url: skill.repoUrl,
    skill_page: skill.skillPage,
    origin: skill.origin,
    visibility: skill.visibility,
  });
  const skills = librarySnapshot.skills.map(skillRecord);
  const skillRecordById = new Map(librarySnapshot.skills.map((skill, index) => [skill.id, skills[index]]));
  const libraries = librarySnapshot.libraries.map((library) => compactRecord({
    key: library.key,
    title: library.title,
    kind: library.kind,
    kind_label: library.kindLabel,
    source_label: library.sourceLabel,
    source_url: library.sourceUrl,
    description: library.description,
    page: library.page,
    skills: library.skillIds.map(nameForSkillId).filter(Boolean),
    repos: library.repos,
    plugins: library.plugins,
    categories: library.legacyCategories,
    primary_category: library.legacyPrimaryCategory,
    status_counts: library.statusCounts,
    high_value_count: library.highValueCount,
    starred_count: library.starredCount,
  }));
  const categorySkillNames = Object.fromEntries(librarySnapshot.categories.map((category) => {
    const names = librarySnapshot.categoryMemberships
      .filter((membership) => membership.categoryId === category.id)
      .map((membership) => nameForSkillId(membership.skillId))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "en"));
    return [category.name, names];
  }));
  const categoryUnits = librarySnapshot.categories.map((category) => ({
    category: category.name,
    skill_count: categorySkillNames[category.name].length,
    units: category.unitIds.map((id) => unitsById.get(id)).filter(Boolean).map((unit) => compactRecord({
      type: unit.type,
      title: unit.title,
      kind: unit.kind,
      page: unit.page,
      skills: unit.skillIds.map(nameForSkillId).filter(Boolean),
      skill_count: unit.skillIds.length,
    })),
  }));
  const personalCollection = librarySnapshot.collections.find((collection) => collection.kind === "personal-deck");
  const personalSkills = (personalCollection?.skillIds ?? []).map((id) => skillRecordById.get(id)).filter(Boolean);
  return {
    generatedAt,
    sourceDir,
    skills,
    libraries,
    categoryUnits,
    categorySkillNames,
    personalSkills,
    changes: librarySnapshot.changes,
    starredSkills: librarySnapshot.starredSkills,
    relations: librarySnapshot.relations,
    skillDetails: librarySnapshot.skillDetails,
    maintenanceStatus: librarySnapshot.maintenanceStatus,
  };
}
