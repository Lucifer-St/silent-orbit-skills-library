import { createContentId, validateInventorySnapshotV1 } from "./generator-contracts.mjs";

const UPDATE_CHANNELS = new Set(["source-managed", "external", "system-managed", "unknown", "mixed"]);
const SECRET_PREFIXES = [
  ["github", "pat"].join("_") + "_",
  ["gh", "p_"].join(""),
];
const LONG_SECRET_PATTERN = new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9_-]{12,}`, "i");
const PRIVATE_VALUE_PATTERN = /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/|bearer\s+[A-Za-z0-9._-]{12,}|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/i;

function invariant(condition, message) {
  if (!condition) throw new Error(`Health report violation: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsPrivateEvidence(value) {
  if (typeof value === "string") return PRIVATE_VALUE_PATTERN.test(value) || SECRET_PREFIXES.some((prefix) => value.includes(prefix)) || LONG_SECRET_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsPrivateEvidence);
  if (isRecord(value)) return Object.values(value).some(containsPrivateEvidence);
  return false;
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function unique(values) {
  return [...new Set(values)];
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), "en");
}

function identityKey(name) {
  return String(name).normalize("NFKC").trim().toLowerCase();
}

function healthEvidenceId(evidence) {
  return createContentId("health-evidence", JSON.stringify(evidence));
}

function createEvidence(evidence) {
  return { id: healthEvidenceId(evidence), ...evidence };
}

function addEvidence(collection, evidence) {
  const record = createEvidence(evidence);
  if (!collection.has(record.id)) collection.set(record.id, record);
  return record.id;
}

function presenceState(items) {
  const states = unique(items.map((item) => item.state)).sort(compareText);
  return states.length === 1 ? states[0] : "conflict";
}

function sourceState(items, sourceById) {
  const states = unique(items.map((item) => sourceById.get(item.sourceId)?.scanState ?? "failed"));
  if (states.includes("failed")) return "failed";
  if (states.includes("partial")) return "partial";
  return states.length === 1 && states[0] === "complete" ? "complete" : "unknown";
}

function updateChannel(items, sourceById) {
  const channels = unique(items.map((item) => sourceById.get(item.sourceId)?.capabilities?.updateChannel ?? "unknown")).sort(compareText);
  return channels.length === 1 ? channels[0] : "mixed";
}

function explicitValues(items, field) {
  return unique(items.map((item) => item.observed?.[field]).filter((value) => typeof value === "string" && value.length > 0)).sort(compareText);
}

function identityState(items) {
  if (items.length === 1) return "consistent";
  const explicitFields = ["author", "sourceUrl", "trigger"];
  if (explicitFields.some((field) => explicitValues(items, field).length > 1)) return "conflict";
  return explicitFields.some((field) => explicitValues(items, field).length === 1) ? "consistent" : "unknown";
}

function versionState(items) {
  const values = explicitValues(items, "version");
  if (values.length === 0) return { state: "unknown", values };
  if (values.length === 1) return { state: "known", values };
  return { state: "conflict", values };
}

function freshnessState({ inventorySnapshot, evaluatedAt, staleAfterDays, source }) {
  if (staleAfterDays === undefined || !["complete", "partial"].includes(source)) return "unknown";
  const ageMilliseconds = Date.parse(evaluatedAt) - Date.parse(inventorySnapshot.generatedAt);
  if (ageMilliseconds < 0) return "unknown";
  return ageMilliseconds > staleAfterDays * 86_400_000 ? "stale" : "current";
}

function providerUnresolved(source) {
  const unresolved = [];
  if (source.scanState === "failed") unresolved.push("source-failed");
  else if (source.scanState === "partial") unresolved.push("source-partial");
  if (source.capabilities.updateChannel === "unknown") unresolved.push("update-channel-unknown");
  return unresolved;
}

function skillUnresolved({ presence, source, duplicate, identity, version, updateChannel: channel, freshness }) {
  const unresolved = [];
  if (presence !== "present") unresolved.push(`presence-${presence}`);
  if (source !== "complete") unresolved.push(`source-${source}`);
  if (duplicate === "duplicate") unresolved.push("duplicate-records");
  if (identity !== "consistent") unresolved.push(`identity-${identity}`);
  if (version !== "known") unresolved.push(`version-${version}`);
  if (["unknown", "mixed"].includes(channel)) unresolved.push(`update-channel-${channel}`);
  if (freshness !== "current") unresolved.push(`freshness-${freshness}`);
  return unresolved;
}

function statusFor(providers, skills) {
  if (providers.some((provider) => provider.scanState === "failed") || skills.some((skill) => [
    "missing",
    "conflict",
  ].includes(skill.presence) || skill.identity === "conflict" || skill.version.state === "conflict")) return "error";
  if (providers.some((provider) => provider.unresolved.length > 0) || skills.some((skill) => skill.unresolved.length > 0)) return "attention";
  return "ok";
}

function validateAllowedKeys(record, keys, label) {
  invariant(isRecord(record), `${label} must be an object.`);
  const unexpected = Object.keys(record).filter((key) => !keys.includes(key));
  invariant(unexpected.length === 0, `${label} contains unsupported fields: ${unexpected.join(", ")}.`);
}

function validateUniqueIds(records, label) {
  const ids = records.map((record) => record.id);
  invariant(ids.every((id) => typeof id === "string" && id.length > 0), `${label} needs stable ids.`);
  invariant(new Set(ids).size === ids.length, `${label} contains duplicate ids.`);
}

export function createHealthReportV1({ inventorySnapshot, evaluatedAt = inventorySnapshot?.generatedAt, staleAfterDays } = {}) {
  validateInventorySnapshotV1(inventorySnapshot);
  invariant(typeof evaluatedAt === "string" && !Number.isNaN(Date.parse(evaluatedAt)), "evaluatedAt must be an explicit ISO timestamp.");
  if (staleAfterDays !== undefined) invariant(Number.isFinite(staleAfterDays) && staleAfterDays >= 0, "staleAfterDays must be a non-negative number when supplied.");

  const sourceById = new Map(inventorySnapshot.sources.map((source) => [source.id, source]));
  const evidence = new Map();
  const diagnosticEvidenceBySource = new Map();
  const diagnosticEvidenceByItem = new Map();
  for (const diagnostic of inventorySnapshot.diagnostics) {
    const evidenceId = addEvidence(evidence, compactRecord({
      kind: "diagnostic",
      subjectType: diagnostic.itemId ? "skill" : "provider",
      subjectId: diagnostic.itemId ?? diagnostic.sourceId,
      sourceId: diagnostic.sourceId,
      field: "diagnostic-code",
      value: diagnostic.code,
      observedAt: inventorySnapshot.generatedAt,
      basis: "snapshot-diagnostic",
    }));
    const bySource = diagnosticEvidenceBySource.get(diagnostic.sourceId) ?? [];
    bySource.push(evidenceId);
    diagnosticEvidenceBySource.set(diagnostic.sourceId, bySource);
    if (diagnostic.itemId) {
      const byItem = diagnosticEvidenceByItem.get(diagnostic.itemId) ?? [];
      byItem.push(evidenceId);
      diagnosticEvidenceByItem.set(diagnostic.itemId, byItem);
    }
  }

  const providers = inventorySnapshot.sources.map((source) => {
    const evidenceIds = [
      addEvidence(evidence, {
        kind: "source-scan",
        subjectType: "provider",
        subjectId: source.id,
        sourceId: source.id,
        field: "scan-state",
        value: source.scanState,
        observedAt: inventorySnapshot.generatedAt,
        basis: "provider-snapshot",
      }),
      addEvidence(evidence, {
        kind: "update-channel",
        subjectType: "provider",
        subjectId: source.id,
        sourceId: source.id,
        field: "update-channel",
        value: source.capabilities.updateChannel,
        observedAt: inventorySnapshot.generatedAt,
        basis: "provider-capability",
      }),
      ...(diagnosticEvidenceBySource.get(source.id) ?? []),
    ];
    return {
      id: source.id,
      providerKind: source.providerKind,
      label: source.label,
      scanState: source.scanState,
      updateChannel: source.capabilities.updateChannel,
      evidenceIds: unique(evidenceIds).sort(compareText),
      unresolved: providerUnresolved(source),
    };
  }).sort((left, right) => compareText(left.id, right.id));

  const groups = new Map();
  for (const item of inventorySnapshot.items) {
    const key = identityKey(item.name);
    const records = groups.get(key) ?? [];
    records.push(item);
    groups.set(key, records);
  }
  const duplicateDiagnosticItems = new Set(inventorySnapshot.diagnostics.filter((entry) => entry.code === "duplicate-skill" && entry.itemId).map((entry) => entry.itemId));
  const skills = [...groups.entries()].sort(([left], [right]) => compareText(left, right)).map(([key, rawItems]) => {
    const items = [...rawItems].sort((left, right) => compareText(left.id, right.id));
    const id = createContentId("health-skill", key);
    const name = items.map((item) => item.name).sort(compareText)[0];
    const presence = presenceState(items);
    const source = sourceState(items, sourceById);
    const duplicate = items.length > 1 || items.some((item) => duplicateDiagnosticItems.has(item.id)) ? "duplicate" : "none";
    const identity = identityState(items);
    const version = versionState(items);
    const channel = updateChannel(items, sourceById);
    const freshness = freshnessState({ inventorySnapshot, evaluatedAt, staleAfterDays, source });
    const evidenceIds = [];
    for (const item of items) {
      evidenceIds.push(addEvidence(evidence, {
        kind: "presence",
        subjectType: "skill",
        subjectId: id,
        sourceId: item.sourceId,
        field: "presence",
        value: item.state,
        observedAt: inventorySnapshot.generatedAt,
        basis: "provider-snapshot",
      }));
      evidenceIds.push(addEvidence(evidence, {
        kind: "update-channel",
        subjectType: "skill",
        subjectId: id,
        sourceId: item.sourceId,
        field: "update-channel",
        value: sourceById.get(item.sourceId)?.capabilities?.updateChannel ?? "unknown",
        observedAt: inventorySnapshot.generatedAt,
        basis: "provider-capability",
      }));
      if (item.observed?.version) evidenceIds.push(addEvidence(evidence, {
        kind: "version",
        subjectType: "skill",
        subjectId: id,
        sourceId: item.sourceId,
        field: "version",
        value: item.observed.version,
        observedAt: inventorySnapshot.generatedAt,
        basis: "explicit-metadata",
      }));
      for (const field of ["author", "sourceUrl", "trigger"]) {
        if (!item.observed?.[field]) continue;
        evidenceIds.push(addEvidence(evidence, {
          kind: "identity",
          subjectType: "skill",
          subjectId: id,
          sourceId: item.sourceId,
          field,
          value: item.observed[field],
          observedAt: inventorySnapshot.generatedAt,
          basis: "explicit-metadata",
        }));
      }
      evidenceIds.push(...(diagnosticEvidenceByItem.get(item.id) ?? []));
    }
    if (items.length > 1) evidenceIds.push(addEvidence(evidence, {
      kind: "duplicate",
      subjectType: "skill",
      subjectId: id,
      field: "source-count",
      value: String(unique(items.map((item) => item.sourceId)).length),
      observedAt: inventorySnapshot.generatedAt,
      basis: "snapshot-identity",
    }));
    evidenceIds.push(addEvidence(evidence, {
      kind: "freshness",
      subjectType: "skill",
      subjectId: id,
      field: "snapshot-time",
      value: inventorySnapshot.generatedAt,
      observedAt: evaluatedAt,
      basis: staleAfterDays === undefined ? "snapshot-without-threshold" : "explicit-time-policy",
    }));
    const unresolved = skillUnresolved({ presence, source, duplicate, identity, version: version.state, updateChannel: channel, freshness });
    return {
      id,
      name,
      itemIds: items.map((item) => item.id),
      sourceIds: unique(items.map((item) => item.sourceId)).sort(compareText),
      presence,
      sourceState: source,
      duplicate,
      identity,
      version,
      updateChannel: channel,
      freshness,
      evidenceIds: unique(evidenceIds).sort(compareText),
      unresolved,
    };
  });

  const status = statusFor(providers, skills);
  const body = {
    schemaVersion: 1,
    projectId: inventorySnapshot.projectId,
    generatedAt: evaluatedAt,
    privacy: "sanitized",
    inventorySnapshot: {
      id: inventorySnapshot.snapshotId,
      generatedAt: inventorySnapshot.generatedAt,
    },
    policy: compactRecord({
      freshnessEvidence: "explicit-time-or-snapshot-required",
      staleAfterDays,
    }),
    status,
    providers,
    skills,
    evidence: [...evidence.values()].sort((left, right) => compareText(left.id, right.id)),
    summary: {
      providers: providers.length,
      sourceFailures: providers.filter((provider) => provider.scanState === "failed").length,
      sourcePartial: providers.filter((provider) => provider.scanState === "partial").length,
      skillIdentities: skills.length,
      present: skills.filter((skill) => skill.presence === "present").length,
      missing: skills.filter((skill) => skill.presence === "missing").length,
      unknownPresence: skills.filter((skill) => skill.presence === "unknown").length,
      presenceConflicts: skills.filter((skill) => skill.presence === "conflict").length,
      duplicateIdentities: skills.filter((skill) => skill.duplicate === "duplicate").length,
      identityConflicts: skills.filter((skill) => skill.identity === "conflict").length,
      versionsKnown: skills.filter((skill) => skill.version.state === "known").length,
      versionsUnknown: skills.filter((skill) => skill.version.state === "unknown").length,
      versionConflicts: skills.filter((skill) => skill.version.state === "conflict").length,
      freshnessStale: skills.filter((skill) => skill.freshness === "stale").length,
      freshnessUnknown: skills.filter((skill) => skill.freshness === "unknown").length,
      unresolved: providers.filter((provider) => provider.unresolved.length > 0).length + skills.filter((skill) => skill.unresolved.length > 0).length,
    },
  };
  return validateHealthReportV1({ ...body, reportId: createContentId("health-report", JSON.stringify(body)) });
}

export function validateHealthReportV1(report) {
  validateAllowedKeys(report, ["schemaVersion", "reportId", "projectId", "generatedAt", "privacy", "inventorySnapshot", "policy", "status", "providers", "skills", "evidence", "summary"], "HealthReportV1");
  invariant(report.schemaVersion === 1, "schemaVersion must be 1.");
  invariant(typeof report.reportId === "string" && report.reportId.length > 0, "reportId is required.");
  invariant(typeof report.projectId === "string" && report.projectId.length > 0, "projectId is required.");
  invariant(typeof report.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt)), "generatedAt must be an ISO timestamp.");
  invariant(report.privacy === "sanitized", "privacy must be sanitized.");
  invariant(["ok", "attention", "error"].includes(report.status), "status is invalid.");
  validateAllowedKeys(report.inventorySnapshot, ["id", "generatedAt"], "HealthReportV1.inventorySnapshot");
  invariant(typeof report.inventorySnapshot.id === "string" && report.inventorySnapshot.id.length > 0, "inventory snapshot id is required.");
  invariant(!Number.isNaN(Date.parse(report.inventorySnapshot.generatedAt)), "inventory snapshot time is invalid.");
  validateAllowedKeys(report.policy, ["freshnessEvidence", "staleAfterDays"], "HealthReportV1.policy");
  invariant(report.policy.freshnessEvidence === "explicit-time-or-snapshot-required", "freshness evidence policy is invalid.");
  if (report.policy.staleAfterDays !== undefined) invariant(Number.isFinite(report.policy.staleAfterDays) && report.policy.staleAfterDays >= 0, "staleAfterDays is invalid.");
  invariant(Array.isArray(report.providers) && Array.isArray(report.skills) && Array.isArray(report.evidence), "providers, skills, and evidence must be arrays.");
  validateUniqueIds(report.providers, "HealthReportV1.providers");
  validateUniqueIds(report.skills, "HealthReportV1.skills");
  validateUniqueIds(report.evidence, "HealthReportV1.evidence");
  const evidenceIds = new Set(report.evidence.map((entry) => entry.id));
  for (const provider of report.providers) {
    validateAllowedKeys(provider, ["id", "providerKind", "label", "scanState", "updateChannel", "evidenceIds", "unresolved"], `Health provider ${provider.id}`);
    invariant(["complete", "partial", "failed"].includes(provider.scanState), `provider ${provider.id} scanState is invalid.`);
    invariant(UPDATE_CHANNELS.has(provider.updateChannel) && provider.updateChannel !== "mixed", `provider ${provider.id} update channel is invalid.`);
    invariant(Array.isArray(provider.evidenceIds) && provider.evidenceIds.every((id) => evidenceIds.has(id)), `provider ${provider.id} has missing evidence.`);
    invariant(Array.isArray(provider.unresolved), `provider ${provider.id} unresolved must be an array.`);
  }
  for (const skill of report.skills) {
    validateAllowedKeys(skill, ["id", "name", "itemIds", "sourceIds", "presence", "sourceState", "duplicate", "identity", "version", "updateChannel", "freshness", "evidenceIds", "unresolved"], `Health Skill ${skill.id}`);
    invariant(["present", "missing", "unknown", "conflict"].includes(skill.presence), `Skill ${skill.id} presence is invalid.`);
    invariant(["complete", "partial", "failed", "unknown"].includes(skill.sourceState), `Skill ${skill.id} sourceState is invalid.`);
    invariant(["none", "duplicate"].includes(skill.duplicate), `Skill ${skill.id} duplicate state is invalid.`);
    invariant(["consistent", "conflict", "unknown"].includes(skill.identity), `Skill ${skill.id} identity state is invalid.`);
    validateAllowedKeys(skill.version, ["state", "values"], `Health Skill ${skill.id}.version`);
    invariant(["known", "conflict", "unknown"].includes(skill.version.state) && Array.isArray(skill.version.values), `Skill ${skill.id} version evidence is invalid.`);
    invariant(UPDATE_CHANNELS.has(skill.updateChannel), `Skill ${skill.id} update channel is invalid.`);
    invariant(["current", "stale", "unknown"].includes(skill.freshness), `Skill ${skill.id} freshness is invalid.`);
    invariant(Array.isArray(skill.itemIds) && Array.isArray(skill.sourceIds), `Skill ${skill.id} references must be arrays.`);
    invariant(Array.isArray(skill.evidenceIds) && skill.evidenceIds.every((id) => evidenceIds.has(id)), `Skill ${skill.id} has missing evidence.`);
    invariant(Array.isArray(skill.unresolved), `Skill ${skill.id} unresolved must be an array.`);
  }
  for (const entry of report.evidence) {
    validateAllowedKeys(entry, ["id", "kind", "subjectType", "subjectId", "sourceId", "field", "value", "observedAt", "basis"], `Health evidence ${entry.id}`);
    invariant(["source-scan", "presence", "duplicate", "identity", "version", "update-channel", "freshness", "diagnostic"].includes(entry.kind), `Evidence ${entry.id} kind is invalid.`);
    invariant(["provider", "skill"].includes(entry.subjectType), `Evidence ${entry.id} subject type is invalid.`);
    invariant(typeof entry.subjectId === "string" && entry.subjectId.length > 0, `Evidence ${entry.id} subject is invalid.`);
    invariant(typeof entry.observedAt === "string" && !Number.isNaN(Date.parse(entry.observedAt)), `Evidence ${entry.id} time is invalid.`);
    invariant(typeof entry.basis === "string" && entry.basis.length > 0, `Evidence ${entry.id} basis is invalid.`);
  }
  validateAllowedKeys(report.summary, ["providers", "sourceFailures", "sourcePartial", "skillIdentities", "present", "missing", "unknownPresence", "presenceConflicts", "duplicateIdentities", "identityConflicts", "versionsKnown", "versionsUnknown", "versionConflicts", "freshnessStale", "freshnessUnknown", "unresolved"], "HealthReportV1.summary");
  invariant(report.summary.providers === report.providers.length, "provider summary is stale.");
  invariant(report.summary.skillIdentities === report.skills.length, "Skill summary is stale.");
  invariant(report.summary.sourceFailures === report.providers.filter((provider) => provider.scanState === "failed").length, "source failure summary is stale.");
  invariant(report.summary.sourcePartial === report.providers.filter((provider) => provider.scanState === "partial").length, "partial source summary is stale.");
  invariant(report.summary.present === report.skills.filter((skill) => skill.presence === "present").length, "present summary is stale.");
  invariant(report.summary.missing === report.skills.filter((skill) => skill.presence === "missing").length, "missing summary is stale.");
  invariant(report.summary.unknownPresence === report.skills.filter((skill) => skill.presence === "unknown").length, "unknown presence summary is stale.");
  invariant(report.summary.presenceConflicts === report.skills.filter((skill) => skill.presence === "conflict").length, "presence conflict summary is stale.");
  invariant(report.summary.duplicateIdentities === report.skills.filter((skill) => skill.duplicate === "duplicate").length, "duplicate summary is stale.");
  invariant(report.summary.identityConflicts === report.skills.filter((skill) => skill.identity === "conflict").length, "identity conflict summary is stale.");
  invariant(report.summary.versionsKnown === report.skills.filter((skill) => skill.version.state === "known").length, "known version summary is stale.");
  invariant(report.summary.versionsUnknown === report.skills.filter((skill) => skill.version.state === "unknown").length, "unknown version summary is stale.");
  invariant(report.summary.versionConflicts === report.skills.filter((skill) => skill.version.state === "conflict").length, "version conflict summary is stale.");
  invariant(report.summary.freshnessStale === report.skills.filter((skill) => skill.freshness === "stale").length, "stale freshness summary is stale.");
  invariant(report.summary.freshnessUnknown === report.skills.filter((skill) => skill.freshness === "unknown").length, "unknown freshness summary is stale.");
  invariant(report.summary.unresolved === report.providers.filter((provider) => provider.unresolved.length > 0).length + report.skills.filter((skill) => skill.unresolved.length > 0).length, "unresolved summary is stale.");
  invariant(!containsPrivateEvidence(report), "report contains private evidence.");
  const { reportId, ...body } = report;
  invariant(reportId === createContentId("health-report", JSON.stringify(body)), "reportId is stale.");
  return report;
}
