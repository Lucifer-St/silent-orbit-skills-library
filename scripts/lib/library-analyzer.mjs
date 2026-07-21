import {
  buildRendererViewModel,
  createCategoryId,
  createContentId,
  createLibraryId,
  createLibrarySnapshotV1,
  createSiteManifestV1,
  createSourceId,
  validateInventorySnapshotV1,
  validateProjectConfigV1,
} from "./generator-contracts.mjs";

const PUBLIC_VISIBILITIES = new Set(["public", "creator-showcase"]);
const ORIGINS = new Set(["third-party", "creator", "system", "unknown"]);
const GOVERNANCE_VISIBILITIES = new Set(["public", "creator-showcase", "local-only", "review-required"]);
const PRIVATE_PATTERNS = [
  /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /bearer\s+[A-Za-z0-9._-]{12,}/i,
];
const SECRET_PREFIXES = [["github", "pat"].join("_") + "_", ["gh", "p_"].join("")];
const LONG_SECRET_PATTERN = new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9_-]{12,}`, "i");

const DEFAULT_TAXONOMY = Object.freeze({
  reviewCategory: { key: "review-required", name: "Review Required" },
  categories: [
    { key: "research-knowledge", name: "Research & Knowledge", terms: ["research", "source", "citation", "knowledge", "search", "paper", "notion", "obsidian"] },
    { key: "software-development", name: "Software Development", terms: ["code", "frontend", "backend", "react", "api", "debug", "test", "github", "database", "typescript", "python"] },
    { key: "data-analytics", name: "Data & Analytics", terms: ["data", "analytics", "metric", "spreadsheet", "excel", "sql", "dashboard", "report"] },
    { key: "creative-media", name: "Creative & Media", terms: ["design", "image", "video", "audio", "slide", "presentation", "creative", "figma", "canva"] },
    { key: "documents-communication", name: "Documents & Communication", terms: ["document", "pdf", "write", "email", "calendar", "message", "meeting", "translate"] },
    { key: "automation-operations", name: "Automation & Operations", terms: ["automation", "browser", "workflow", "deploy", "maintenance", "monitor", "system", "skill", "agent"] },
  ],
});

function invariant(condition, message) {
  if (!condition) throw new Error(`Library analyzer violation: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function termMatches(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

function hasPrivateEvidence(value) {
  const text = String(value ?? "");
  return SECRET_PREFIXES.some((prefix) => text.includes(prefix))
    || LONG_SECRET_PATTERN.test(text)
    || PRIVATE_PATTERNS.some((pattern) => pattern.test(text));
}

function safeText(value, label, { allowEmpty = false, maximumLength = 2000 } = {}) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, maximumLength);
  invariant(allowEmpty || text.length > 0, `${label} is required.`);
  invariant(!hasPrivateEvidence(text), `${label} contains private evidence.`);
  return text;
}

function safeKey(value, label) {
  const key = safeText(value, label, { maximumLength: 120 });
  invariant(/^[a-z0-9][a-z0-9._-]*$/i.test(key), `${label} must be a portable key.`);
  return key;
}

function allowedKeys(record, keys, label) {
  invariant(isRecord(record), `${label} must be an object.`);
  const unexpected = Object.keys(record).filter((key) => !keys.includes(key));
  invariant(unexpected.length === 0, `${label} contains unsupported fields: ${unexpected.join(", ")}.`);
}

function cloneDefaultTaxonomy() {
  return structuredClone(DEFAULT_TAXONOMY);
}

export function createDefaultAnalysisOverridesV1() {
  return {
    schemaVersion: 1,
    taxonomy: cloneDefaultTaxonomy(),
    governance: [],
    skillOverrides: [],
    libraryOverrides: [],
    collections: [],
  };
}

function validateSelector(selector, label) {
  allowedKeys(selector, ["sourceKey", "sourceId", "name"], label);
  const name = safeText(selector.name, `${label}.name`, { maximumLength: 160 });
  const sourceKey = selector.sourceKey === undefined ? undefined : safeKey(selector.sourceKey, `${label}.sourceKey`);
  const sourceId = selector.sourceId === undefined ? undefined : safeText(selector.sourceId, `${label}.sourceId`, { maximumLength: 200 });
  invariant(!(sourceKey && sourceId), `${label} cannot contain both sourceKey and sourceId.`);
  return compactRecord({ sourceKey, sourceId, name });
}

export function validateAnalysisOverridesV1(value = {}) {
  allowedKeys(value, ["schemaVersion", "taxonomy", "governance", "skillOverrides", "libraryOverrides", "collections"], "AnalysisOverridesV1");
  invariant(value.schemaVersion === 1, "AnalysisOverridesV1.schemaVersion must be 1.");

  const taxonomyInput = value.taxonomy ?? cloneDefaultTaxonomy();
  allowedKeys(taxonomyInput, ["reviewCategory", "categories"], "AnalysisOverridesV1.taxonomy");
  allowedKeys(taxonomyInput.reviewCategory, ["key", "name"], "AnalysisOverridesV1.taxonomy.reviewCategory");
  const reviewCategory = {
    key: safeKey(taxonomyInput.reviewCategory.key, "review category key"),
    name: safeText(taxonomyInput.reviewCategory.name, "review category name", { maximumLength: 160 }),
  };
  invariant(Array.isArray(taxonomyInput.categories) && taxonomyInput.categories.length > 0, "AnalysisOverridesV1.taxonomy.categories must be non-empty.");
  const categories = taxonomyInput.categories.map((category, index) => {
    allowedKeys(category, ["key", "name", "terms"], `AnalysisOverridesV1.taxonomy.categories[${index}]`);
    invariant(Array.isArray(category.terms) && category.terms.length > 0, `Category ${category.key ?? index} needs matching terms.`);
    return {
      key: safeKey(category.key, `category ${index} key`),
      name: safeText(category.name, `category ${index} name`, { maximumLength: 160 }),
      terms: uniqueSorted(category.terms.map((term, termIndex) => safeText(term, `category ${index} term ${termIndex}`, { maximumLength: 80 }).toLowerCase())),
    };
  });
  const categoryKeys = [reviewCategory.key, ...categories.map((category) => category.key)];
  invariant(new Set(categoryKeys).size === categoryKeys.length, "Taxonomy category keys must be unique.");

  const governance = value.governance ?? [];
  invariant(Array.isArray(governance), "AnalysisOverridesV1.governance must be an array.");
  const normalizedGovernance = governance.map((entry, index) => {
    allowedKeys(entry, ["sourceKey", "name", "origin", "visibility"], `governance[${index}]`);
    const normalized = {
      sourceKey: safeKey(entry.sourceKey, `governance[${index}].sourceKey`),
      name: safeText(entry.name, `governance[${index}].name`, { maximumLength: 160 }),
      origin: entry.origin,
      visibility: entry.visibility,
    };
    if (normalized.origin !== undefined) invariant(ORIGINS.has(normalized.origin), `governance[${index}] has invalid origin.`);
    if (normalized.visibility !== undefined) invariant(GOVERNANCE_VISIBILITIES.has(normalized.visibility), `governance[${index}] has invalid visibility.`);
    invariant(normalized.origin !== undefined || normalized.visibility !== undefined, `governance[${index}] has no override.`);
    return compactRecord(normalized);
  });

  const skillOverrides = value.skillOverrides ?? [];
  invariant(Array.isArray(skillOverrides), "AnalysisOverridesV1.skillOverrides must be an array.");
  const normalizedSkillOverrides = skillOverrides.map((entry, index) => {
    allowedKeys(entry, ["selector", "description", "trigger", "categoryKeys", "primaryCategoryKey"], `skillOverrides[${index}]`);
    const categoryList = entry.categoryKeys === undefined ? undefined : uniqueSorted(entry.categoryKeys.map((key) => safeKey(key, `skillOverrides[${index}] category key`)));
    if (categoryList) {
      invariant(categoryList.length > 0, `skillOverrides[${index}].categoryKeys cannot be empty.`);
      invariant(categoryList.every((key) => categoryKeys.includes(key)), `skillOverrides[${index}] references an unknown category.`);
    }
    const primaryCategoryKey = entry.primaryCategoryKey === undefined ? undefined : safeKey(entry.primaryCategoryKey, `skillOverrides[${index}].primaryCategoryKey`);
    if (primaryCategoryKey) invariant(categoryList?.includes(primaryCategoryKey), `skillOverrides[${index}] primary category must appear in categoryKeys.`);
    const normalized = compactRecord({
      selector: validateSelector(entry.selector, `skillOverrides[${index}].selector`),
      description: entry.description === undefined ? undefined : safeText(entry.description, `skillOverrides[${index}].description`),
      trigger: entry.trigger === undefined ? undefined : safeText(entry.trigger, `skillOverrides[${index}].trigger`, { maximumLength: 300 }),
      categoryKeys: categoryList,
      primaryCategoryKey,
    });
    invariant(Object.keys(normalized).length > 1, `skillOverrides[${index}] has no override.`);
    return normalized;
  });

  const libraryOverrides = value.libraryOverrides ?? [];
  invariant(Array.isArray(libraryOverrides), "AnalysisOverridesV1.libraryOverrides must be an array.");
  const normalizedLibraryOverrides = libraryOverrides.map((entry, index) => {
    allowedKeys(entry, ["sourceKey", "sourceId", "title", "kind", "description"], `libraryOverrides[${index}]`);
    const sourceKey = entry.sourceKey === undefined ? undefined : safeKey(entry.sourceKey, `libraryOverrides[${index}].sourceKey`);
    const sourceId = entry.sourceId === undefined ? undefined : safeText(entry.sourceId, `libraryOverrides[${index}].sourceId`, { maximumLength: 200 });
    invariant(Boolean(sourceKey) !== Boolean(sourceId), `libraryOverrides[${index}] needs exactly one source selector.`);
    return compactRecord({
      sourceKey,
      sourceId,
      title: entry.title === undefined ? undefined : safeText(entry.title, `libraryOverrides[${index}].title`, { maximumLength: 160 }),
      kind: entry.kind === undefined ? undefined : safeKey(entry.kind, `libraryOverrides[${index}].kind`),
      description: entry.description === undefined ? undefined : safeText(entry.description, `libraryOverrides[${index}].description`),
    });
  });

  const collections = value.collections ?? [];
  invariant(Array.isArray(collections), "AnalysisOverridesV1.collections must be an array.");
  const normalizedCollections = collections.map((collection, index) => {
    allowedKeys(collection, ["key", "kind", "title", "skills"], `collections[${index}]`);
    invariant(Array.isArray(collection.skills) && collection.skills.length > 0, `collections[${index}] needs Skills.`);
    return {
      key: safeKey(collection.key, `collections[${index}].key`),
      kind: collection.kind === "personal-deck" ? "personal-deck" : "curated",
      title: safeText(collection.title, `collections[${index}].title`, { maximumLength: 160 }),
      skills: collection.skills.map((selector, selectorIndex) => validateSelector(selector, `collections[${index}].skills[${selectorIndex}]`)),
    };
  });
  invariant(new Set(collections.map((collection) => collection.key)).size === collections.length, "Collection keys must be unique.");

  const normalized = {
    schemaVersion: 1,
    taxonomy: { reviewCategory, categories },
    governance: normalizedGovernance,
    skillOverrides: normalizedSkillOverrides,
    libraryOverrides: normalizedLibraryOverrides,
    collections: normalizedCollections,
  };
  invariant(!hasPrivateEvidence(JSON.stringify(normalized)), "AnalysisOverridesV1 contains private evidence.");
  return normalized;
}

function selectorSourceId(selector) {
  return selector.sourceId ?? (selector.sourceKey ? createSourceId(selector.sourceKey) : undefined);
}

function selectInventoryItem(items, selector, label) {
  const sourceId = selectorSourceId(selector);
  const matches = items.filter((item) => item.name === selector.name && (!sourceId || item.sourceId === sourceId));
  invariant(matches.length === 1, `${label} must resolve exactly one Inventory Skill; resolved ${matches.length}.`);
  return matches[0];
}

function scoreCategory(item, category) {
  const fields = [
    { value: normalizedText(item.name), weight: 4 },
    { value: normalizedText(item.observed?.trigger), weight: 2 },
    { value: normalizedText(item.observed?.description), weight: 1 },
  ];
  const matchedTerms = [];
  let score = 0;
  for (const term of category.terms) {
    let matched = false;
    for (const field of fields) {
      if (termMatches(field.value, term)) {
        score += field.weight;
        matched = true;
      }
    }
    if (matched) matchedTerms.push(term);
  }
  return { key: category.key, score, matchedTerms };
}

function classificationFor(item, override, taxonomy) {
  if (override?.categoryKeys) {
    return {
      decision: "curated",
      categoryKeys: override.categoryKeys,
      primaryCategoryKey: override.primaryCategoryKey ?? override.categoryKeys[0],
      matchedTerms: [],
      basis: "curated-override",
    };
  }
  const scores = taxonomy.categories.map((category) => scoreCategory(item, category)).filter((result) => result.score > 0);
  if (scores.length === 0) {
    return {
      decision: "review-required",
      categoryKeys: [taxonomy.reviewCategory.key],
      primaryCategoryKey: taxonomy.reviewCategory.key,
      matchedTerms: [],
      basis: "review-required",
      reason: "no-rule-match",
    };
  }
  const topScore = Math.max(...scores.map((result) => result.score));
  const leaders = scores.filter((result) => result.score === topScore).sort((left, right) => left.key.localeCompare(right.key, "en"));
  if (leaders.length !== 1) {
    return {
      decision: "review-required",
      categoryKeys: [taxonomy.reviewCategory.key],
      primaryCategoryKey: taxonomy.reviewCategory.key,
      matchedTerms: uniqueSorted(leaders.flatMap((result) => result.matchedTerms)),
      basis: "review-required",
      reason: "ambiguous-rule-match",
      candidates: leaders.map((result) => result.key),
    };
  }
  return {
    decision: "inferred",
    categoryKeys: [leaders[0].key],
    primaryCategoryKey: leaders[0].key,
    matchedTerms: leaders[0].matchedTerms,
    basis: "inferred-rule",
  };
}

function localMaintenanceStatus(inventorySnapshot, skillCount) {
  const channels = uniqueSorted(inventorySnapshot.sources.map((source) => source.capabilities.updateChannel)).map((channel) => ({
    id: channel,
    state: channel === "external" ? "external" : channel === "system-managed" ? "system-managed" : "unchecked",
    checkedSources: inventorySnapshot.sources.filter((source) => source.capabilities.updateChannel === channel).length,
    execution: channel === "system-managed" || channel === "external" ? "codex-runtime" : "local-codex",
  }));
  return {
    schemaVersion: 1,
    snapshotDate: inventorySnapshot.generatedAt.slice(0, 10),
    privacy: "sanitized",
    catalogSkills: skillCount,
    publicGlobalSkills: skillCount,
    publicationHandoff: {
      productionAuthority: "local-library",
      publicRepository: "not-configured",
      requiredCheck: "not-configured",
      deployProvider: "none",
      directPrivateProductionDeploy: false,
    },
    channels,
    handoffPrompt: {
      "zh-CN": "发布前先审阅 analysis-report.json，并为所有 review-required 项目设置明确治理规则。",
      "en-US": "Review analysis-report.json and resolve every review-required record before publication.",
    },
  };
}

function analysisReportV1({ inventorySnapshot, taxonomy, itemResults, diagnostics, overridesApplied }) {
  const sortedItems = [...itemResults].sort((left, right) => left.skillId.localeCompare(right.skillId, "en"));
  const sortedDiagnostics = [...diagnostics].sort((left, right) => left.id.localeCompare(right.id, "en"));
  const body = {
    schemaVersion: 1,
    inventorySnapshotId: inventorySnapshot.snapshotId,
    generatedAt: inventorySnapshot.generatedAt,
    privacy: "sanitized",
    taxonomy: {
      reviewCategoryKey: taxonomy.reviewCategory.key,
      categoryKeys: taxonomy.categories.map((category) => category.key),
    },
    items: sortedItems,
    diagnostics: sortedDiagnostics,
    summary: {
      inventoryItems: sortedItems.length,
      included: sortedItems.filter((item) => item.publication === "included").length,
      reviewRequired: sortedItems.filter((item) => item.decision === "review-required" || item.publication === "review-required").length,
      excluded: sortedItems.filter((item) => item.publication.startsWith("excluded")).length,
      overridesApplied,
    },
  };
  return validateAnalysisReportV1({
    ...body,
    reportId: createContentId("analysis-report", JSON.stringify(body)),
  });
}

export function validateAnalysisReportV1(report) {
  allowedKeys(report, ["schemaVersion", "reportId", "inventorySnapshotId", "generatedAt", "privacy", "taxonomy", "items", "diagnostics", "summary"], "AnalysisReportV1");
  invariant(report.schemaVersion === 1, "AnalysisReportV1.schemaVersion must be 1.");
  invariant(typeof report.reportId === "string" && report.reportId.length > 0, "AnalysisReportV1.reportId is required.");
  invariant(typeof report.inventorySnapshotId === "string" && report.inventorySnapshotId.length > 0, "AnalysisReportV1.inventorySnapshotId is required.");
  invariant(typeof report.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt)), "AnalysisReportV1.generatedAt must be an ISO timestamp.");
  invariant(report.privacy === "sanitized", "AnalysisReportV1 must be sanitized.");
  invariant(isRecord(report.taxonomy) && Array.isArray(report.items) && Array.isArray(report.diagnostics), "AnalysisReportV1 needs taxonomy, items, and diagnostics.");
  invariant(isRecord(report.summary), "AnalysisReportV1.summary is required.");
  allowedKeys(report.summary, ["inventoryItems", "included", "reviewRequired", "excluded", "overridesApplied"], "AnalysisReportV1.summary");
  invariant(report.summary.inventoryItems === report.items.length, "AnalysisReportV1 inventory summary is stale.");
  invariant(report.summary.included === report.items.filter((item) => item.publication === "included").length, "AnalysisReportV1 included summary is stale.");
  invariant(report.summary.reviewRequired === report.items.filter((item) => item.decision === "review-required" || item.publication === "review-required").length, "AnalysisReportV1 review summary is stale.");
  invariant(report.summary.excluded === report.items.filter((item) => String(item.publication).startsWith("excluded")).length, "AnalysisReportV1 excluded summary is stale.");
  invariant(!hasPrivateEvidence(JSON.stringify(report)), "AnalysisReportV1 contains private evidence.");
  return report;
}

export function analyzeInventorySnapshotV1({ projectConfig, inventorySnapshot, analysisOverrides, sourceDir = "library.snapshot.json" }) {
  validateProjectConfigV1(projectConfig);
  validateInventorySnapshotV1(inventorySnapshot);
  invariant(projectConfig.projectId === inventorySnapshot.projectId, "Project and Inventory project ids do not match.");
  const overrides = validateAnalysisOverridesV1(analysisOverrides ?? createDefaultAnalysisOverridesV1());
  const sourceById = new Map(inventorySnapshot.sources.map((source) => [source.id, source]));

  const overrideBySkillId = new Map();
  for (const [index, override] of overrides.skillOverrides.entries()) {
    const item = selectInventoryItem(inventorySnapshot.items, override.selector, `skillOverrides[${index}]`);
    invariant(!overrideBySkillId.has(item.id), `Multiple skill overrides target ${item.name}.`);
    overrideBySkillId.set(item.id, override);
  }

  const libraryOverrideBySourceId = new Map();
  for (const [index, override] of overrides.libraryOverrides.entries()) {
    const sourceId = override.sourceId ?? createSourceId(override.sourceKey);
    invariant(sourceById.has(sourceId), `libraryOverrides[${index}] references an unknown source.`);
    invariant(!libraryOverrideBySourceId.has(sourceId), `Multiple library overrides target ${sourceId}.`);
    libraryOverrideBySourceId.set(sourceId, override);
  }

  const categoryDefinitionByKey = new Map([
    [overrides.taxonomy.reviewCategory.key, overrides.taxonomy.reviewCategory],
    ...overrides.taxonomy.categories.map((category) => [category.key, category]),
  ]);
  const categoryIdByKey = new Map([...categoryDefinitionByKey].map(([key]) => [key, createCategoryId(key)]));
  const included = [];
  const itemResults = [];
  let overridesApplied = 0;

  for (const item of [...inventorySnapshot.items].sort((left, right) => left.id.localeCompare(right.id, "en"))) {
    const override = overrideBySkillId.get(item.id);
    if (override) overridesApplied += 1;
    if (item.visibility === "review-required") {
      itemResults.push({ skillId: item.id, name: item.name, sourceId: item.sourceId, publication: "review-required", decision: "review-required", reason: "governance-not-confirmed", categoryKeys: [] });
      continue;
    }
    if (!PUBLIC_VISIBILITIES.has(item.visibility)) {
      itemResults.push({ skillId: item.id, name: item.name, sourceId: item.sourceId, publication: "excluded-visibility", decision: "excluded", categoryKeys: [] });
      continue;
    }
    if (item.state === "missing") {
      itemResults.push({ skillId: item.id, name: item.name, sourceId: item.sourceId, publication: "excluded-missing", decision: "excluded", categoryKeys: [] });
      continue;
    }
    const classification = classificationFor(item, override, overrides.taxonomy);
    const source = sourceById.get(item.sourceId);
    invariant(source, `Inventory Skill ${item.id} references an unknown source.`);
    included.push({ item, source, override, classification });
    itemResults.push(compactRecord({
      skillId: item.id,
      name: item.name,
      sourceId: item.sourceId,
      publication: "included",
      decision: classification.decision,
      reason: classification.reason,
      categoryKeys: classification.categoryKeys,
      primaryCategoryKey: classification.primaryCategoryKey,
      matchedTerms: classification.matchedTerms,
      candidates: classification.candidates,
    }));
  }

  const includedBySourceId = new Map();
  for (const record of included) {
    const group = includedBySourceId.get(record.item.sourceId) ?? [];
    group.push(record);
    includedBySourceId.set(record.item.sourceId, group);
  }

  const libraries = [...includedBySourceId.entries()].map(([sourceId, records]) => {
    const source = sourceById.get(sourceId);
    const override = libraryOverrideBySourceId.get(sourceId);
    if (override) overridesApplied += 1;
    const categories = uniqueSorted(records.flatMap((record) => record.classification.categoryKeys).map((key) => categoryDefinitionByKey.get(key).name));
    const statusCounts = Object.fromEntries([...new Set(records.map((record) => record.item.status).filter(Boolean))].sort().map((status) => [status, records.filter((record) => record.item.status === status).length]));
    return compactRecord({
      id: createLibraryId(sourceId),
      key: sourceId,
      sourceId,
      title: override?.title ?? source.label,
      kind: override?.kind ?? source.providerKind,
      kindLabel: override?.kind ?? source.providerKind,
      sourceLabel: source.label,
      sourceUrl: source.sourceUrl,
      description: override?.description ?? `Read-only ${source.providerKind} source.`,
      skillIds: records.map((record) => record.item.id).sort((left, right) => left.localeCompare(right, "en")),
      legacyCategories: categories,
      legacyPrimaryCategory: categories[0],
      statusCounts: Object.keys(statusCounts).length > 0 ? statusCounts : undefined,
      highValueCount: 0,
      starredCount: 0,
    });
  }).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const libraryBySourceId = new Map(libraries.map((library) => [library.sourceId, library]));

  const categoryMemberships = included.flatMap(({ item, classification }) => classification.categoryKeys.map((categoryKey) => ({
    categoryId: categoryIdByKey.get(categoryKey),
    skillId: item.id,
    basis: [classification.basis],
  }))).sort((left, right) => left.categoryId.localeCompare(right.categoryId, "en") || left.skillId.localeCompare(right.skillId, "en"));

  const skills = included.map(({ item, source, override, classification }) => {
    const description = override?.description ?? item.observed?.description ?? `Public metadata for ${item.name}.`;
    const trigger = override?.trigger ?? item.observed?.trigger ?? `$${item.name}`;
    const observed = ["name", "sourceId", "origin", "visibility"];
    const inferred = ["libraryId"];
    const curated = [];
    if (item.observed?.description && !override?.description) observed.push("description");
    else if (override?.description) curated.push("description");
    else inferred.push("description");
    if (item.observed?.trigger && !override?.trigger) observed.push("trigger");
    else if (override?.trigger) curated.push("trigger");
    else inferred.push("trigger");
    if (classification.decision === "curated") curated.push("primaryCategoryId", "categoryMemberships");
    else inferred.push("primaryCategoryId", "categoryMemberships");
    if (item.status) observed.push("status");
    if (item.observed?.sourceUrl) observed.push("repoUrl");
    return compactRecord({
      id: item.id,
      name: item.name,
      description,
      trigger,
      legacyCategory: categoryDefinitionByKey.get(classification.primaryCategoryKey).name,
      primaryCategoryId: categoryIdByKey.get(classification.primaryCategoryKey),
      sourceId: item.sourceId,
      libraryId: libraryBySourceId.get(item.sourceId).id,
      libraryTitle: libraryOverrideBySourceId.get(item.sourceId)?.title ?? source.label,
      status: item.status,
      repo: null,
      repoUrl: item.observed?.sourceUrl ?? null,
      origin: item.origin,
      visibility: item.visibility,
      provenance: {
        observed: uniqueSorted(observed),
        inferred: uniqueSorted(inferred),
        curated: uniqueSorted(curated),
      },
    });
  }).sort((left, right) => left.id.localeCompare(right.id, "en"));

  const unitRecords = [];
  const unitIdsByCategoryKey = new Map();
  for (const [categoryKey, definition] of categoryDefinitionByKey) {
    const categoryId = categoryIdByKey.get(categoryKey);
    const categorySkillIds = new Set(categoryMemberships.filter((entry) => entry.categoryId === categoryId).map((entry) => entry.skillId));
    if (categorySkillIds.size === 0) continue;
    const unitIds = [];
    for (const library of libraries) {
      const skillIds = library.skillIds.filter((skillId) => categorySkillIds.has(skillId));
      if (skillIds.length === 0) continue;
      const id = createContentId("unit", `${categoryKey}\u0000${library.sourceId}`);
      unitRecords.push({ id, categoryId, type: "library", title: library.title, kind: library.kind, libraryId: library.id, skillIds });
      unitIds.push(id);
    }
    unitIdsByCategoryKey.set(categoryKey, unitIds.sort((left, right) => left.localeCompare(right, "en")));
  }
  const categories = [...unitIdsByCategoryKey.entries()].map(([key, unitIds]) => ({
    id: categoryIdByKey.get(key),
    name: categoryDefinitionByKey.get(key).name,
    unitIds,
  }));

  const includedItems = included.map((record) => record.item);
  const collections = overrides.collections.map((collection, index) => {
    const skillIds = collection.skills.map((selector, selectorIndex) => {
      const item = selectInventoryItem(inventorySnapshot.items, selector, `collections[${index}].skills[${selectorIndex}]`);
      invariant(includedItems.some((candidate) => candidate.id === item.id), `Collection ${collection.key} references a Skill that is not publishable.`);
      return item.id;
    });
    overridesApplied += 1;
    return { id: createContentId("collection", collection.key), kind: collection.kind, title: collection.title, skillIds: uniqueSorted(skillIds) };
  });

  const librarySnapshot = createLibrarySnapshotV1({
    projectId: projectConfig.projectId,
    generatedAt: inventorySnapshot.generatedAt,
    skills,
    libraries,
    categories,
    units: unitRecords,
    categoryMemberships,
    collections,
    maintenanceStatus: localMaintenanceStatus(inventorySnapshot, skills.length),
  });
  const siteManifest = createSiteManifestV1({ projectConfig, inventorySnapshot, librarySnapshot });
  const appData = buildRendererViewModel({ librarySnapshot, generatedAt: inventorySnapshot.generatedAt, sourceDir });
  const diagnostics = inventorySnapshot.diagnostics.map((diagnostic) => ({
    id: diagnostic.id,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    sourceId: diagnostic.sourceId,
    ...(diagnostic.itemId ? { skillId: diagnostic.itemId } : {}),
  }));
  const analysisReport = analysisReportV1({ inventorySnapshot, taxonomy: overrides.taxonomy, itemResults, diagnostics, overridesApplied });
  invariant(!hasPrivateEvidence(JSON.stringify({ librarySnapshot, siteManifest, appData, analysisReport })), "Analyzer output contains private evidence.");
  return { librarySnapshot, siteManifest, appData, analysisReport };
}
