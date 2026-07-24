import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const managementOperations = Object.freeze(["install", "update", "freeze", "remove", "restore"]);
export const providerCapabilityStates = Object.freeze(["supported", "unsupported", "unknown"]);

const CAPABILITY_STATE_SET = new Set(providerCapabilityStates);
const OPERATION_SET = new Set(managementOperations);
const CHANGE_ACTIONS = new Set(["ensure-directory", "write-file", "remove-path", "remove-target"]);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const PLAN_STEP_PHASES = Object.freeze(["precondition", "backup", "apply", "rescan", "verify", "rollback", "receipt"]);
const RECEIPT_STATUSES = new Set(["blocked", "dry-run", "succeeded", "failed", "rolled-back", "rollback-failed"]);
const RECEIPT_STEP_STATES = new Set(["blocked", "planned", "passed", "completed", "failed", "skipped"]);
export const trustedExternalManagerExceptions = Object.freeze([
  "native-direct-write",
  "no-native-staging",
  "no-native-transaction-rollback",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAllowedKeys(record, keys, label) {
  invariant(isRecord(record), `${label} must be an object.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) invariant(allowed.has(key), `${label} contains unsupported field ${key}.`);
}

function assertIdentifier(value, label) {
  invariant(typeof value === "string" && IDENTIFIER_PATTERN.test(value), `${label} must be a portable identifier.`);
  return value;
}

function assertNonEmptyString(value, label) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
  return value;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function stableValue(value, label = "value") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    invariant(Number.isFinite(value), `${label} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => stableValue(entry, `${label}[${index}]`));
  invariant(isRecord(value), `${label} must contain only JSON-compatible values.`);
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, stableValue(value[key], `${label}.${key}`)]),
  );
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix, value, length = 24) {
  return `${prefix}-${sha256(stableJson(value)).slice(0, length)}`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function capabilityEvidencePayload(providerId, evidence) {
  return {
    providerId,
    operation: evidence.operation,
    kind: evidence.kind,
    claim: evidence.claim,
    basis: stableValue(evidence.basis, "capability evidence basis"),
  };
}

export function createCapabilityEvidenceV1({
  providerId,
  operation,
  kind = "contract-test",
  claim,
  basis,
  id,
} = {}) {
  assertIdentifier(providerId, "capability evidence providerId");
  invariant(OPERATION_SET.has(operation), `Unsupported capability evidence operation ${operation}.`);
  assertIdentifier(kind, "capability evidence kind");
  assertNonEmptyString(claim, "capability evidence claim");
  invariant(basis !== undefined, "capability evidence basis is required.");
  const payload = capabilityEvidencePayload(providerId, { operation, kind, claim, basis });
  const digest = sha256(stableJson(payload));
  return deepFreeze({
    id: id ? assertIdentifier(id, "capability evidence id") : `evidence-${operation}-${digest.slice(0, 16)}`,
    operation,
    kind,
    claim,
    basis: stableValue(basis, "capability evidence basis"),
    verification: {
      algorithm: "sha256",
      digest,
    },
  });
}

function validateCapabilityEvidence(providerId, evidence) {
  assertAllowedKeys(evidence, ["id", "operation", "kind", "claim", "basis", "verification"], `Capability evidence ${evidence?.id ?? "<unknown>"}`);
  assertIdentifier(evidence.id, "capability evidence id");
  invariant(OPERATION_SET.has(evidence.operation), `Capability evidence ${evidence.id} operation is invalid.`);
  assertIdentifier(evidence.kind, `Capability evidence ${evidence.id} kind`);
  assertNonEmptyString(evidence.claim, `Capability evidence ${evidence.id} claim`);
  stableValue(evidence.basis, `Capability evidence ${evidence.id} basis`);
  assertAllowedKeys(evidence.verification, ["algorithm", "digest"], `Capability evidence ${evidence.id} verification`);
  invariant(evidence.verification.algorithm === "sha256", `Capability evidence ${evidence.id} must use sha256 verification.`);
  invariant(DIGEST_PATTERN.test(evidence.verification.digest), `Capability evidence ${evidence.id} digest is invalid.`);
  const expected = sha256(stableJson(capabilityEvidencePayload(providerId, evidence)));
  invariant(evidence.verification.digest === expected, `Capability evidence ${evidence.id} digest does not verify.`);
  return evidence;
}

function capabilityIdentityPayload(capability) {
  return {
    schemaVersion: capability.schemaVersion,
    provider: capability.provider,
    defaultState: capability.defaultState,
    readOnly: capability.readOnly,
    operations: capability.operations,
    evidence: capability.evidence,
  };
}

export function createProviderCapabilityV1({
  providerId,
  providerKind = "unknown",
  label = providerId,
  operations = {},
  evidence = [],
} = {}) {
  assertIdentifier(providerId, "providerId");
  assertIdentifier(providerKind, "providerKind");
  assertNonEmptyString(label, "provider label");
  invariant(isRecord(operations), "operations must be an object.");
  const normalizedEvidence = evidence.map((entry) => cloneJson(entry))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const evidenceIds = new Set();
  for (const entry of normalizedEvidence) {
    validateCapabilityEvidence(providerId, entry);
    invariant(!evidenceIds.has(entry.id), `Duplicate capability evidence id ${entry.id}.`);
    evidenceIds.add(entry.id);
  }

  const normalizedOperations = {};
  for (const operation of managementOperations) {
    const configured = operations[operation] ?? {};
    assertAllowedKeys(configured, ["state", "evidenceIds"], `Provider operation ${operation}`);
    const state = configured.state ?? "unknown";
    invariant(CAPABILITY_STATE_SET.has(state), `Provider operation ${operation} state must be supported, unsupported, or unknown.`);
    const operationEvidenceIds = uniqueSorted(configured.evidenceIds ?? []);
    invariant(operationEvidenceIds.every((evidenceId) => evidenceIds.has(evidenceId)), `Provider operation ${operation} references missing evidence.`);
    if (state === "supported") {
      invariant(operationEvidenceIds.length > 0, `Supported operation ${operation} requires verifiable evidence.`);
      invariant(operationEvidenceIds.every((evidenceId) => normalizedEvidence.find((entry) => entry.id === evidenceId)?.operation === operation), `Supported operation ${operation} evidence must match the operation.`);
    }
    normalizedOperations[operation] = {
      state,
      access: state === "supported" ? "guarded" : "read-only",
      evidenceIds: operationEvidenceIds,
    };
  }
  for (const operation of Object.keys(operations)) invariant(OPERATION_SET.has(operation), `Unsupported Provider operation ${operation}.`);

  const capability = {
    schemaVersion: 1,
    capabilityId: "",
    provider: {
      id: providerId,
      kind: providerKind,
      label,
    },
    defaultState: "unknown",
    readOnly: managementOperations.every((operation) => normalizedOperations[operation].state !== "supported"),
    operations: normalizedOperations,
    evidence: normalizedEvidence,
  };
  capability.capabilityId = contentId("capability", capabilityIdentityPayload(capability));
  validateProviderCapabilityV1(capability);
  return deepFreeze(capability);
}

export function validateProviderCapabilityV1(capability) {
  assertAllowedKeys(capability, ["schemaVersion", "capabilityId", "provider", "defaultState", "readOnly", "operations", "evidence"], "ProviderCapabilityV1");
  invariant(capability.schemaVersion === 1, "ProviderCapabilityV1 schemaVersion must be 1.");
  assertIdentifier(capability.capabilityId, "ProviderCapabilityV1 capabilityId");
  assertAllowedKeys(capability.provider, ["id", "kind", "label"], "ProviderCapabilityV1 provider");
  assertIdentifier(capability.provider.id, "ProviderCapabilityV1 provider id");
  assertIdentifier(capability.provider.kind, "ProviderCapabilityV1 provider kind");
  assertNonEmptyString(capability.provider.label, "ProviderCapabilityV1 provider label");
  invariant(capability.defaultState === "unknown", "ProviderCapabilityV1 defaultState must remain unknown.");
  invariant(typeof capability.readOnly === "boolean", "ProviderCapabilityV1 readOnly must be boolean.");
  assertAllowedKeys(capability.operations, managementOperations, "ProviderCapabilityV1 operations");
  invariant(Array.isArray(capability.evidence), "ProviderCapabilityV1 evidence must be an array.");
  const evidenceIds = new Set();
  for (const evidence of capability.evidence) {
    validateCapabilityEvidence(capability.provider.id, evidence);
    invariant(!evidenceIds.has(evidence.id), `Duplicate capability evidence id ${evidence.id}.`);
    evidenceIds.add(evidence.id);
  }
  for (const operation of managementOperations) {
    const record = capability.operations[operation];
    assertAllowedKeys(record, ["state", "access", "evidenceIds"], `ProviderCapabilityV1 operation ${operation}`);
    invariant(CAPABILITY_STATE_SET.has(record.state), `ProviderCapabilityV1 operation ${operation} state is invalid.`);
    invariant(record.access === (record.state === "supported" ? "guarded" : "read-only"), `ProviderCapabilityV1 operation ${operation} access is stale.`);
    invariant(Array.isArray(record.evidenceIds) && record.evidenceIds.every((id) => evidenceIds.has(id)), `ProviderCapabilityV1 operation ${operation} evidence is invalid.`);
    invariant(JSON.stringify(record.evidenceIds) === JSON.stringify(uniqueSorted(record.evidenceIds)), `ProviderCapabilityV1 operation ${operation} evidenceIds must be unique and sorted.`);
    if (record.state === "supported") {
      invariant(record.evidenceIds.length > 0, `Supported operation ${operation} requires evidence.`);
      invariant(record.evidenceIds.every((id) => capability.evidence.find((entry) => entry.id === id)?.operation === operation), `Supported operation ${operation} evidence does not verify the operation.`);
    }
  }
  invariant(capability.readOnly === managementOperations.every((operation) => capability.operations[operation].state !== "supported"), "ProviderCapabilityV1 readOnly is stale.");
  invariant(capability.capabilityId === contentId("capability", capabilityIdentityPayload(capability)), "ProviderCapabilityV1 capabilityId is stale.");
  return capability;
}

export function createUnknownManagementProvider({ providerId, providerKind = "unknown", label = providerId } = {}) {
  const capability = createProviderCapabilityV1({ providerId, providerKind, label });
  return Object.freeze({
    id: providerId,
    kind: providerKind,
    label,
    capability,
    probeCapability({ operation }) {
      invariant(OPERATION_SET.has(operation), `Unsupported management operation ${operation}.`);
      return {
        state: "unknown",
        capabilityId: capability.capabilityId,
        evidenceIds: [],
      };
    },
  });
}

export function normalizePortableRelativePath(value, { allowDot = false, label = "relative path" } = {}) {
  assertNonEmptyString(value, label);
  const replaced = value.replace(/\\/g, "/");
  if (allowDot && replaced === ".") return ".";
  invariant(!replaced.startsWith("/") && !replaced.startsWith("//"), `${label} must not be absolute.`);
  invariant(!/^[a-zA-Z]:/.test(replaced), `${label} must not contain a Windows drive.`);
  const segments = replaced.split("/");
  invariant(segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), `${label} must be a normalized child path.`);
  return segments.join("/");
}

function normalizedRequest(request) {
  assertAllowedKeys(request, ["providerId", "providerKind", "providerLabel", "operation", "targets", "parameters"], "Management request");
  const providerId = assertIdentifier(request.providerId, "Management request providerId");
  const providerKind = assertIdentifier(request.providerKind ?? "unknown", "Management request providerKind");
  const providerLabel = assertNonEmptyString(request.providerLabel ?? providerId, "Management request providerLabel");
  invariant(OPERATION_SET.has(request.operation), `Unsupported management operation ${request.operation}.`);
  invariant(Array.isArray(request.targets) && request.targets.length > 0, "Management request targets must be a non-empty array.");
  const targetIds = new Set();
  const targets = request.targets.map((target) => {
    assertAllowedKeys(target, ["id", "rootId", "relativePath"], `Management request target ${target?.id ?? "<unknown>"}`);
    const normalized = {
      id: assertIdentifier(target.id, "Management target id"),
      rootId: assertIdentifier(target.rootId, `Management target ${target.id} rootId`),
      relativePath: normalizePortableRelativePath(target.relativePath, { label: `Management target ${target.id} relativePath` }),
    };
    invariant(!targetIds.has(normalized.id), `Duplicate management target id ${normalized.id}.`);
    targetIds.add(normalized.id);
    return normalized;
  }).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const parameters = stableValue(request.parameters ?? {}, "Management request parameters");
  return { providerId, providerKind, providerLabel, operation: request.operation, targets, parameters };
}

function allowedRootValue(allowedRoots, rootId) {
  if (allowedRoots instanceof Map) return allowedRoots.get(rootId);
  if (isRecord(allowedRoots)) return allowedRoots[rootId];
  return undefined;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertNoSymlinkSegments(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  invariant(isWithin(resolvedRoot, resolvedCandidate), `${label} escaped its allowed root.`);
  const rootStats = fs.lstatSync(resolvedRoot, { throwIfNoEntry: false });
  invariant(rootStats?.isDirectory() && !rootStats.isSymbolicLink(), `Allowed root for ${label} must be an existing real directory.`);
  const segments = path.relative(resolvedRoot, resolvedCandidate).split(path.sep).filter(Boolean);
  let current = resolvedRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stats = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stats) break;
    invariant(!stats.isSymbolicLink(), `${label} must not traverse a symbolic link or junction.`);
  }
  return resolvedCandidate;
}

function resolveTargetRuntime(target, allowedRoots) {
  const configured = allowedRootValue(allowedRoots, target.rootId);
  invariant(typeof configured === "string" && path.isAbsolute(configured), `Allowed root ${target.rootId} must be an explicit absolute path.`);
  const root = path.resolve(configured);
  const absolutePath = path.resolve(root, ...target.relativePath.split("/"));
  return {
    root,
    absolutePath: assertNoSymlinkSegments(root, absolutePath, `Target ${target.id}`),
  };
}

function walkSnapshot(root, relative = "") {
  const absolute = relative ? path.join(root, ...relative.split("/")) : root;
  return fs.readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const portablePath = relative ? `${relative}/${entry.name}` : entry.name;
      const entryPath = path.join(absolute, entry.name);
      const stats = fs.lstatSync(entryPath);
      invariant(!stats.isSymbolicLink(), `Target snapshot must not contain a symbolic link or junction at ${portablePath}.`);
      if (stats.isDirectory()) {
        return [
          { path: portablePath, type: "directory" },
          ...walkSnapshot(root, portablePath),
        ];
      }
      invariant(stats.isFile(), `Target snapshot contains unsupported entry ${portablePath}.`);
      const bytes = fs.readFileSync(entryPath);
      return [{
        path: portablePath,
        type: "file",
        bytes: bytes.toString("base64"),
      }];
    });
}

function snapshotDigest(snapshot) {
  if (snapshot.kind === "absent") return sha256("silent-orbit-management:absent:v1");
  const digestEntries = snapshot.entries.map((entry) => entry.type === "file"
    ? { path: entry.path, type: "file", bytes: Buffer.from(entry.bytes, "base64").length, sha256: sha256(Buffer.from(entry.bytes, "base64")) }
    : { path: entry.path, type: "directory" });
  return sha256(stableJson({ kind: snapshot.kind, entries: digestEntries }));
}

function readTargetSnapshot(absolutePath) {
  const stats = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!stats) {
    const snapshot = { kind: "absent", entries: [] };
    return { ...snapshot, digest: snapshotDigest(snapshot) };
  }
  invariant(!stats.isSymbolicLink(), "Management targets must not be symbolic links or junctions.");
  invariant(stats.isDirectory(), "Management targets must be directories or absent.");
  const snapshot = { kind: "directory", entries: walkSnapshot(absolutePath) };
  return { ...snapshot, digest: snapshotDigest(snapshot) };
}

function snapshotModel(snapshot) {
  return {
    kind: snapshot.kind,
    entries: new Map(snapshot.entries.map((entry) => [entry.path, { ...entry }])),
  };
}

function ensureDirectoryInModel(model, portablePath) {
  if (model.kind === "absent") model.kind = "directory";
  invariant(model.kind === "directory", "A directory change cannot target a non-directory.");
  if (portablePath === ".") return;
  const segments = portablePath.split("/");
  for (let index = 1; index <= segments.length; index += 1) {
    const current = segments.slice(0, index).join("/");
    const existing = model.entries.get(current);
    invariant(!existing || existing.type === "directory", `Management change crosses file ${current}.`);
    if (!existing) model.entries.set(current, { path: current, type: "directory" });
  }
}

function removeModelPath(model, portablePath) {
  if (model.kind === "absent") return;
  for (const entryPath of [...model.entries.keys()]) {
    if (entryPath === portablePath || entryPath.startsWith(`${portablePath}/`)) model.entries.delete(entryPath);
  }
}

function applyChangeToModel(model, change) {
  if (change.action === "remove-target") {
    model.kind = "absent";
    model.entries.clear();
    return;
  }
  if (change.action === "ensure-directory") {
    ensureDirectoryInModel(model, change.path);
    return;
  }
  if (change.action === "remove-path") {
    removeModelPath(model, change.path);
    return;
  }
  invariant(change.action === "write-file", `Unsupported management change ${change.action}.`);
  const parent = change.path.includes("/") ? change.path.slice(0, change.path.lastIndexOf("/")) : ".";
  ensureDirectoryInModel(model, parent);
  const existing = model.entries.get(change.path);
  invariant(!existing || existing.type === "file", `Management write would replace directory ${change.path}.`);
  model.entries.set(change.path, { path: change.path, type: "file", bytes: change.contentBase64 });
}

function modelSnapshot(model) {
  const snapshot = {
    kind: model.kind,
    entries: [...model.entries.values()].sort((left, right) => left.path.localeCompare(right.path, "en")),
  };
  return { ...snapshot, digest: snapshotDigest(snapshot) };
}

function normalizeBase64(value, label) {
  assertNonEmptyString(value, label);
  const bytes = Buffer.from(value, "base64");
  invariant(bytes.toString("base64") === value, `${label} must be canonical base64.`);
  return value;
}

export function encodeManagementFile(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return bytes.toString("base64");
}

function normalizeChanges(changes, targetIds) {
  invariant(Array.isArray(changes), "Provider preview changes must be an array.");
  const changeIds = new Set();
  return changes.map((change, index) => {
    assertAllowedKeys(change, ["id", "targetId", "action", "path", "contentBase64"], `Provider preview change ${change?.id ?? index + 1}`);
    const action = change.action;
    invariant(CHANGE_ACTIONS.has(action), `Provider preview change ${change.id} action is invalid.`);
    const normalized = {
      id: assertIdentifier(change.id, `Provider preview change ${index + 1} id`),
      sequence: index + 1,
      targetId: assertIdentifier(change.targetId, `Provider preview change ${change.id} targetId`),
      action,
      path: normalizePortableRelativePath(change.path ?? ".", { allowDot: true, label: `Provider preview change ${change.id} path` }),
    };
    invariant(targetIds.has(normalized.targetId), `Provider preview change ${normalized.id} references an unknown target.`);
    invariant(!changeIds.has(normalized.id), `Duplicate Provider preview change id ${normalized.id}.`);
    changeIds.add(normalized.id);
    if (action === "remove-target") invariant(normalized.path === ".", `remove-target change ${normalized.id} must use path '.'.`);
    else invariant(normalized.path !== ".", `${action} change ${normalized.id} must name a child path.`);
    if (action === "write-file") normalized.contentBase64 = normalizeBase64(change.contentBase64, `Provider preview change ${normalized.id} contentBase64`);
    else invariant(change.contentBase64 === undefined, `Provider preview change ${normalized.id} must not contain content.`);
    return normalized;
  });
}

function capabilityDigest(capability) {
  return sha256(stableJson(capability));
}

function validateProviderShape(provider) {
  invariant(isRecord(provider), "Management Provider is required.");
  assertIdentifier(provider.id, "Management Provider id");
  assertIdentifier(provider.kind, "Management Provider kind");
  assertNonEmptyString(provider.label, "Management Provider label");
  validateProviderCapabilityV1(provider.capability);
  invariant(provider.capability.provider.id === provider.id, "Management Provider capability id does not match.");
  invariant(provider.capability.provider.kind === provider.kind, "Management Provider capability kind does not match.");
  return provider;
}

function normalizeExecutionContract(provider, evidence = {}) {
  const configured = provider.execution;
  if (configured === undefined) {
    invariant(Object.keys(evidence).length === 0, "Core-writer execution cannot carry external evidence.");
    return {
      mode: "core-writer",
      manager: null,
      nativeTransactionGuarantee: true,
      exceptions: [],
      evidence: {},
    };
  }
  assertAllowedKeys(configured, ["mode", "manager", "nativeTransactionGuarantee", "exceptions"], `Provider ${provider.id} execution`);
  invariant(configured.mode === "trusted-external-manager", `Provider ${provider.id} execution mode is invalid.`);
  assertAllowedKeys(configured.manager, ["name", "version", "registryIntegrity", "cliSha256", "packageJsonSha256"], `Provider ${provider.id} external manager`);
  invariant(configured.manager.name === "skills", `Provider ${provider.id} external manager name is invalid.`);
  assertNonEmptyString(configured.manager.version, `Provider ${provider.id} external manager version`);
  assertNonEmptyString(configured.manager.registryIntegrity, `Provider ${provider.id} external manager registryIntegrity`);
  invariant(DIGEST_PATTERN.test(configured.manager.cliSha256), `Provider ${provider.id} external manager cliSha256 is invalid.`);
  invariant(DIGEST_PATTERN.test(configured.manager.packageJsonSha256), `Provider ${provider.id} external manager packageJsonSha256 is invalid.`);
  invariant(configured.nativeTransactionGuarantee === false, `Provider ${provider.id} must not claim a native transaction guarantee.`);
  invariant(
    JSON.stringify(configured.exceptions) === JSON.stringify(trustedExternalManagerExceptions),
    `Provider ${provider.id} trusted external exceptions are incomplete.`,
  );
  return stableValue({
    mode: configured.mode,
    manager: configured.manager,
    nativeTransactionGuarantee: false,
    exceptions: configured.exceptions,
    evidence,
  }, `Provider ${provider.id} execution contract`);
}

function validateExecutionContract(execution, label) {
  assertAllowedKeys(execution, ["mode", "manager", "nativeTransactionGuarantee", "exceptions", "evidence"], label);
  invariant(["core-writer", "trusted-external-manager"].includes(execution.mode), `${label} mode is invalid.`);
  invariant(Array.isArray(execution.exceptions), `${label} exceptions must be an array.`);
  invariant(JSON.stringify(execution.exceptions) === JSON.stringify(uniqueSorted(execution.exceptions)), `${label} exceptions must be unique and sorted.`);
  stableValue(execution.evidence, `${label} evidence`);
  if (execution.mode === "core-writer") {
    invariant(execution.manager === null, `${label} core-writer manager must be null.`);
    invariant(execution.nativeTransactionGuarantee === true, `${label} core-writer transaction guarantee is stale.`);
    invariant(execution.exceptions.length === 0, `${label} core-writer exceptions must be empty.`);
    invariant(Object.keys(execution.evidence).length === 0, `${label} core-writer evidence must be empty.`);
    return execution;
  }
  assertAllowedKeys(execution.manager, ["name", "version", "registryIntegrity", "cliSha256", "packageJsonSha256"], `${label} manager`);
  invariant(execution.manager.name === "skills", `${label} manager name is invalid.`);
  assertNonEmptyString(execution.manager.version, `${label} manager version`);
  assertNonEmptyString(execution.manager.registryIntegrity, `${label} manager registryIntegrity`);
  invariant(DIGEST_PATTERN.test(execution.manager.cliSha256), `${label} manager cliSha256 is invalid.`);
  invariant(DIGEST_PATTERN.test(execution.manager.packageJsonSha256), `${label} manager packageJsonSha256 is invalid.`);
  invariant(execution.nativeTransactionGuarantee === false, `${label} must disclose no native transaction guarantee.`);
  invariant(
    JSON.stringify(execution.exceptions) === JSON.stringify(trustedExternalManagerExceptions),
    `${label} trusted external exceptions are incomplete.`,
  );
  return execution;
}

function verifySupportedProbe(provider, operation) {
  invariant(typeof provider.probeCapability === "function", `Provider ${provider.id} does not implement capability probing.`);
  const probe = provider.probeCapability({ operation, capability: provider.capability });
  invariant(isRecord(probe), `Provider ${provider.id} capability probe must return an object.`);
  assertAllowedKeys(probe, ["state", "capabilityId", "evidenceIds"], `Provider ${provider.id} capability probe`);
  const expected = provider.capability.operations[operation];
  invariant(probe.state === "supported" && probe.state === expected.state, `Provider ${provider.id} did not verify supported capability for ${operation}.`);
  invariant(probe.capabilityId === provider.capability.capabilityId, `Provider ${provider.id} capability probe drifted.`);
  invariant(JSON.stringify(uniqueSorted(probe.evidenceIds ?? [])) === JSON.stringify(expected.evidenceIds), `Provider ${provider.id} capability evidence drifted.`);
  return probe;
}

function planIdentityPayload(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    provider: plan.provider,
    operation: plan.operation,
    requestDigest: plan.requestDigest,
    capability: plan.capability,
    execution: plan.execution,
    executable: plan.executable,
    blockers: plan.blockers,
    targets: plan.targets,
    preconditions: plan.preconditions,
    impact: plan.impact,
    backup: plan.backup,
    steps: plan.steps,
    rollback: plan.rollback,
    changes: plan.changes,
    confirmation: {
      required: plan.confirmation.required,
      mode: plan.confirmation.mode,
      summary: plan.confirmation.summary,
    },
  };
}

function createPlanObject({ provider, request, targetSnapshots, changes, blockers, executionEvidence = {} }) {
  const operationCapability = provider.capability.operations[request.operation];
  const execution = normalizeExecutionContract(provider, executionEvidence);
  const changesByTarget = new Map(request.targets.map((target) => [target.id, []]));
  for (const change of changes) changesByTarget.get(change.targetId).push(change);
  const targets = request.targets.map((target) => {
    const before = targetSnapshots.get(target.id);
    if (!before) {
      return {
        ...target,
        expectedDigest: "unknown",
        expectedAfterDigest: "unknown",
      };
    }
    const model = snapshotModel(before);
    for (const change of changesByTarget.get(target.id)) applyChangeToModel(model, change);
    const after = modelSnapshot(model);
    return {
      ...target,
      expectedDigest: before.digest,
      expectedAfterDigest: execution.mode === "trusted-external-manager"
        ? (blockers.includes("no-update") ? before.digest : "provider-verified")
        : after.digest,
    };
  });
  const executable = operationCapability.state === "supported" && blockers.length === 0;
  const preconditions = [
    {
      id: "capability-supported",
      type: "capability",
      expected: "supported",
      value: operationCapability.state,
    },
    ...targets.map((target) => ({
      id: `allowed-root-${target.id}`,
      type: "allowed-root",
      targetId: target.id,
      rootId: target.rootId,
    })),
    ...targets.map((target) => ({
      id: `digest-${target.id}`,
      type: "target-digest",
      targetId: target.id,
      expectedDigest: target.expectedDigest,
    })),
  ];
  const impact = {
    scope: "declared-targets-only",
    rootIds: uniqueSorted(targets.map((target) => target.rootId)),
    targetIds: targets.map((target) => target.id),
    changeCount: changes.length,
    writes: changes.filter((change) => ["ensure-directory", "write-file"].includes(change.action)).length,
    removals: changes.filter((change) => ["remove-path", "remove-target"].includes(change.action)).length,
    executionMode: execution.mode,
    managerOwnedMutation: execution.mode === "trusted-external-manager",
  };
  const plan = {
    schemaVersion: 1,
    planId: "",
    provider: {
      id: provider.id,
      kind: provider.kind,
      label: provider.label,
    },
    operation: request.operation,
    requestDigest: sha256(stableJson(request)),
    capability: {
      capabilityId: provider.capability.capabilityId,
      digest: capabilityDigest(provider.capability),
      state: operationCapability.state,
      evidenceIds: operationCapability.evidenceIds,
    },
    execution,
    executable,
    blockers: uniqueSorted(blockers),
    targets,
    preconditions,
    impact,
    backup: {
      required: true,
      strategy: "copy-before-apply",
      targetIds: targets.map((target) => target.id),
    },
    steps: PLAN_STEP_PHASES.map((phase, index) => ({
      order: index + 1,
      phase,
      policy: phase === "rollback" ? "on-failure" : "required",
    })),
    rollback: {
      required: true,
      strategy: "restore-all-targets-and-verify-pre-digests",
      targetIds: targets.map((target) => target.id),
    },
    changes,
    confirmation: {
      required: true,
      mode: "exact-token",
      summary: `${request.operation} ${targets.map((target) => target.id).join(",")} through ${provider.id}`,
      token: "",
    },
  };
  plan.planId = contentId("management-plan", planIdentityPayload(plan));
  plan.confirmation.token = `CONFIRM ${request.operation} ${provider.id} ${plan.planId}`;
  validateManagementPlanV1(plan);
  return deepFreeze(plan);
}

function previewReader(runtimeByTarget) {
  return Object.freeze({
    digest(targetId) {
      const runtime = runtimeByTarget.get(targetId);
      invariant(runtime, `Unknown preview target ${targetId}.`);
      return runtime.snapshot.digest;
    },
    readFile(targetId, relativePath) {
      const runtime = runtimeByTarget.get(targetId);
      invariant(runtime, `Unknown preview target ${targetId}.`);
      const portablePath = normalizePortableRelativePath(relativePath, { label: `Preview file for ${targetId}` });
      const absolutePath = assertNoSymlinkSegments(runtime.absolutePath, path.resolve(runtime.absolutePath, ...portablePath.split("/")), `Preview file for ${targetId}`);
      const stats = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
      invariant(stats?.isFile() && !stats.isSymbolicLink(), `Preview file ${targetId}/${portablePath} is unavailable.`);
      return fs.readFileSync(absolutePath);
    },
  });
}

export function createManagementPlanV1({ provider, request, allowedRoots = {} } = {}) {
  validateProviderShape(provider);
  const normalized = normalizedRequest(request);
  invariant(provider.id === normalized.providerId, "Management request Provider id does not match the selected Provider.");
  invariant(provider.kind === normalized.providerKind, "Management request Provider kind does not match the selected Provider.");
  const state = provider.capability.operations[normalized.operation].state;
  if (state !== "supported") {
    return createPlanObject({
      provider,
      request: normalized,
      targetSnapshots: new Map(),
      changes: [],
      blockers: [`capability-${state}`],
    });
  }

  verifySupportedProbe(provider, normalized.operation);
  invariant(typeof provider.preview === "function", `Supported Provider ${provider.id} must implement preview.`);
  invariant(typeof provider.apply === "function", `Supported Provider ${provider.id} must implement apply.`);
  invariant(typeof provider.rescan === "function", `Supported Provider ${provider.id} must implement rescan.`);
  invariant(typeof provider.verify === "function", `Supported Provider ${provider.id} must implement verify.`);

  const runtimeByTarget = new Map();
  const targetSnapshots = new Map();
  for (const target of normalized.targets) {
    const runtime = resolveTargetRuntime(target, allowedRoots);
    const snapshot = readTargetSnapshot(runtime.absolutePath);
    runtimeByTarget.set(target.id, { ...runtime, target, snapshot });
    targetSnapshots.set(target.id, snapshot);
  }
  const preview = provider.preview({
    operation: normalized.operation,
    targets: cloneJson(normalized.targets),
    parameters: cloneJson(normalized.parameters),
    reader: previewReader(runtimeByTarget),
  });
  invariant(isRecord(preview), `Provider ${provider.id} preview must return an object.`);
  assertAllowedKeys(preview, ["changes", "blockers", "executionEvidence"], `Provider ${provider.id} preview`);
  const changes = normalizeChanges(preview.changes, new Set(normalized.targets.map((target) => target.id)));
  const blockers = uniqueSorted(preview.blockers ?? []);
  invariant(blockers.every((blocker) => IDENTIFIER_PATTERN.test(blocker)), `Provider ${provider.id} preview blockers are invalid.`);
  const executionEvidence = stableValue(preview.executionEvidence ?? {}, `Provider ${provider.id} preview executionEvidence`);
  return createPlanObject({ provider, request: normalized, targetSnapshots, changes, blockers, executionEvidence });
}

function validateDigestOrUnknown(value, label, executable, executionMode) {
  if (!executable && value === "unknown") return;
  if (executable && executionMode === "trusted-external-manager" && value === "provider-verified") return;
  invariant(DIGEST_PATTERN.test(value), `${label} must be a SHA-256 digest.`);
}

export function validateManagementPlanV1(plan) {
  assertAllowedKeys(plan, ["schemaVersion", "planId", "provider", "operation", "requestDigest", "capability", "execution", "executable", "blockers", "targets", "preconditions", "impact", "backup", "steps", "rollback", "changes", "confirmation"], "ManagementPlanV1");
  invariant(plan.schemaVersion === 1, "ManagementPlanV1 schemaVersion must be 1.");
  assertIdentifier(plan.planId, "ManagementPlanV1 planId");
  assertAllowedKeys(plan.provider, ["id", "kind", "label"], "ManagementPlanV1 provider");
  assertIdentifier(plan.provider.id, "ManagementPlanV1 provider id");
  assertIdentifier(plan.provider.kind, "ManagementPlanV1 provider kind");
  assertNonEmptyString(plan.provider.label, "ManagementPlanV1 provider label");
  invariant(OPERATION_SET.has(plan.operation), "ManagementPlanV1 operation is invalid.");
  invariant(DIGEST_PATTERN.test(plan.requestDigest), "ManagementPlanV1 requestDigest is invalid.");
  assertAllowedKeys(plan.capability, ["capabilityId", "digest", "state", "evidenceIds"], "ManagementPlanV1 capability");
  assertIdentifier(plan.capability.capabilityId, "ManagementPlanV1 capabilityId");
  invariant(DIGEST_PATTERN.test(plan.capability.digest), "ManagementPlanV1 capability digest is invalid.");
  invariant(CAPABILITY_STATE_SET.has(plan.capability.state), "ManagementPlanV1 capability state is invalid.");
  invariant(Array.isArray(plan.capability.evidenceIds), "ManagementPlanV1 capability evidenceIds must be an array.");
  invariant(plan.capability.evidenceIds.every((id) => IDENTIFIER_PATTERN.test(id)), "ManagementPlanV1 capability evidenceIds are invalid.");
  invariant(JSON.stringify(plan.capability.evidenceIds) === JSON.stringify(uniqueSorted(plan.capability.evidenceIds)), "ManagementPlanV1 capability evidenceIds must be unique and sorted.");
  if (plan.capability.state === "supported") invariant(plan.capability.evidenceIds.length > 0, "ManagementPlanV1 supported capability requires evidence.");
  validateExecutionContract(plan.execution, "ManagementPlanV1 execution");
  invariant(typeof plan.executable === "boolean", "ManagementPlanV1 executable must be boolean.");
  invariant(Array.isArray(plan.blockers) && JSON.stringify(plan.blockers) === JSON.stringify(uniqueSorted(plan.blockers)), "ManagementPlanV1 blockers must be unique and sorted.");
  invariant(plan.blockers.every((blocker) => IDENTIFIER_PATTERN.test(blocker)), "ManagementPlanV1 blockers are invalid.");
  invariant(plan.executable === (plan.capability.state === "supported" && plan.blockers.length === 0), "ManagementPlanV1 executable is stale.");
  invariant(Array.isArray(plan.targets) && plan.targets.length > 0, "ManagementPlanV1 targets must be non-empty.");
  const targetIds = new Set();
  for (const target of plan.targets) {
    assertAllowedKeys(target, ["id", "rootId", "relativePath", "expectedDigest", "expectedAfterDigest"], `ManagementPlanV1 target ${target?.id ?? "<unknown>"}`);
    assertIdentifier(target.id, "ManagementPlanV1 target id");
    invariant(!targetIds.has(target.id), `Duplicate ManagementPlanV1 target ${target.id}.`);
    targetIds.add(target.id);
    assertIdentifier(target.rootId, `ManagementPlanV1 target ${target.id} rootId`);
    invariant(target.relativePath === normalizePortableRelativePath(target.relativePath), `ManagementPlanV1 target ${target.id} relativePath is not normalized.`);
    validateDigestOrUnknown(target.expectedDigest, `ManagementPlanV1 target ${target.id} expectedDigest`, plan.executable, plan.execution.mode);
    validateDigestOrUnknown(target.expectedAfterDigest, `ManagementPlanV1 target ${target.id} expectedAfterDigest`, plan.executable, plan.execution.mode);
  }
  invariant(JSON.stringify(plan.targets.map((target) => target.id)) === JSON.stringify([...targetIds].sort((left, right) => left.localeCompare(right, "en"))), "ManagementPlanV1 targets must be sorted.");
  invariant(Array.isArray(plan.preconditions), "ManagementPlanV1 preconditions must be an array.");
  const expectedPreconditionCount = 1 + (plan.targets.length * 2);
  invariant(plan.preconditions.length === expectedPreconditionCount, "ManagementPlanV1 preconditions are incomplete.");
  const capabilityPrecondition = plan.preconditions[0];
  assertAllowedKeys(capabilityPrecondition, ["id", "type", "expected", "value"], "ManagementPlanV1 capability precondition");
  invariant(capabilityPrecondition.id === "capability-supported" && capabilityPrecondition.type === "capability" && capabilityPrecondition.expected === "supported", "ManagementPlanV1 must require supported capability.");
  invariant(capabilityPrecondition.value === plan.capability.state, "ManagementPlanV1 capability precondition is stale.");
  for (let index = 0; index < plan.targets.length; index += 1) {
    const target = plan.targets[index];
    const allowedRoot = plan.preconditions[1 + index];
    assertAllowedKeys(allowedRoot, ["id", "type", "targetId", "rootId"], `ManagementPlanV1 target ${target.id} allowed-root precondition`);
    invariant(
      allowedRoot.id === `allowed-root-${target.id}`
      && allowedRoot.type === "allowed-root"
      && allowedRoot.targetId === target.id
      && allowedRoot.rootId === target.rootId,
      `ManagementPlanV1 target ${target.id} allowed-root precondition is stale.`,
    );
    const digest = plan.preconditions[1 + plan.targets.length + index];
    assertAllowedKeys(digest, ["id", "type", "targetId", "expectedDigest"], `ManagementPlanV1 target ${target.id} digest precondition`);
    invariant(
      digest.id === `digest-${target.id}`
      && digest.type === "target-digest"
      && digest.targetId === target.id
      && digest.expectedDigest === target.expectedDigest,
      `ManagementPlanV1 target ${target.id} digest precondition is stale.`,
    );
  }
  assertAllowedKeys(plan.impact, ["scope", "rootIds", "targetIds", "changeCount", "writes", "removals", "executionMode", "managerOwnedMutation"], "ManagementPlanV1 impact");
  invariant(plan.impact.scope === "declared-targets-only", "ManagementPlanV1 impact scope is invalid.");
  invariant(Array.isArray(plan.impact.rootIds) && Array.isArray(plan.impact.targetIds), "ManagementPlanV1 impact roots and targets must be arrays.");
  invariant(JSON.stringify(plan.impact.rootIds) === JSON.stringify(uniqueSorted(plan.targets.map((target) => target.rootId))), "ManagementPlanV1 impact rootIds are stale.");
  invariant(JSON.stringify(plan.impact.targetIds) === JSON.stringify(plan.targets.map((target) => target.id)), "ManagementPlanV1 impact targetIds are stale.");
  for (const field of ["changeCount", "writes", "removals"]) invariant(Number.isInteger(plan.impact[field]) && plan.impact[field] >= 0, `ManagementPlanV1 impact ${field} is invalid.`);
  invariant(plan.impact.executionMode === plan.execution.mode, "ManagementPlanV1 impact executionMode is stale.");
  invariant(plan.impact.managerOwnedMutation === (plan.execution.mode === "trusted-external-manager"), "ManagementPlanV1 impact managerOwnedMutation is stale.");
  assertAllowedKeys(plan.backup, ["required", "strategy", "targetIds"], "ManagementPlanV1 backup");
  invariant(plan.backup.required === true && plan.backup.strategy === "copy-before-apply", "ManagementPlanV1 must require copy-before-apply backup.");
  invariant(JSON.stringify(plan.backup.targetIds) === JSON.stringify(plan.targets.map((target) => target.id)), "ManagementPlanV1 backup targets are stale.");
  invariant(Array.isArray(plan.steps) && plan.steps.length === PLAN_STEP_PHASES.length, "ManagementPlanV1 steps are incomplete.");
  invariant(JSON.stringify(plan.steps.map((step) => step.phase)) === JSON.stringify(PLAN_STEP_PHASES), "ManagementPlanV1 step order is invalid.");
  for (let index = 0; index < plan.steps.length; index += 1) {
    const planStep = plan.steps[index];
    assertAllowedKeys(planStep, ["order", "phase", "policy"], `ManagementPlanV1 step ${index + 1}`);
    invariant(planStep.order === index + 1, `ManagementPlanV1 step ${index + 1} order is stale.`);
    invariant(planStep.policy === (planStep.phase === "rollback" ? "on-failure" : "required"), `ManagementPlanV1 step ${planStep.phase} policy is stale.`);
  }
  assertAllowedKeys(plan.rollback, ["required", "strategy", "targetIds"], "ManagementPlanV1 rollback");
  invariant(plan.rollback.required === true && plan.rollback.strategy === "restore-all-targets-and-verify-pre-digests", "ManagementPlanV1 rollback strategy is invalid.");
  invariant(JSON.stringify(plan.rollback.targetIds) === JSON.stringify(plan.targets.map((target) => target.id)), "ManagementPlanV1 rollback targets are stale.");
  const normalizedChanges = normalizeChanges(plan.changes.map(({ sequence: _sequence, ...change }) => change), targetIds);
  invariant(stableJson(normalizedChanges) === stableJson(plan.changes), "ManagementPlanV1 changes are not normalized.");
  if (plan.execution.mode === "trusted-external-manager") invariant(plan.changes.length === 0, "Trusted external manager plans must not claim Core-writer changes.");
  invariant(plan.impact.changeCount === plan.changes.length, "ManagementPlanV1 impact changeCount is stale.");
  assertAllowedKeys(plan.confirmation, ["required", "mode", "summary", "token"], "ManagementPlanV1 confirmation");
  invariant(plan.confirmation.required === true && plan.confirmation.mode === "exact-token", "ManagementPlanV1 must require exact confirmation.");
  assertNonEmptyString(plan.confirmation.summary, "ManagementPlanV1 confirmation summary");
  invariant(plan.confirmation.token === `CONFIRM ${plan.operation} ${plan.provider.id} ${plan.planId}`, "ManagementPlanV1 confirmation token is stale.");
  invariant(plan.planId === contentId("management-plan", planIdentityPayload(plan)), "ManagementPlanV1 planId is stale.");
  return plan;
}

function sanitizeError(error, replacements) {
  let message = error instanceof Error ? error.message : String(error);
  for (const [absolutePath, token] of replacements) {
    if (!absolutePath) continue;
    const escaped = absolutePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    message = message.replace(new RegExp(escaped, "gi"), token);
  }
  return message;
}

function atomicWriteFile(targetPath, bytes) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const nonce = sha256(`${targetPath}\0${bytes.length}\0${Date.now()}`).slice(0, 12);
  const temporary = `${targetPath}.silent-orbit-${nonce}.tmp`;
  const previous = `${targetPath}.silent-orbit-${nonce}.previous`;
  fs.writeFileSync(temporary, bytes);
  let movedPrevious = false;
  try {
    const stats = fs.lstatSync(targetPath, { throwIfNoEntry: false });
    if (stats) {
      invariant(stats.isFile() && !stats.isSymbolicLink(), "Atomic management write target must be a regular file.");
      fs.renameSync(targetPath, previous);
      movedPrevious = true;
    }
    fs.renameSync(temporary, targetPath);
    if (movedPrevious) fs.rmSync(previous, { force: true });
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    if (movedPrevious && fs.existsSync(previous) && !fs.existsSync(targetPath)) fs.renameSync(previous, targetPath);
    throw error;
  }
}

function copyTreeSafe(source, target, relative = "") {
  const absoluteSource = relative ? path.join(source, ...relative.split("/")) : source;
  const absoluteTarget = relative ? path.join(target, ...relative.split("/")) : target;
  fs.mkdirSync(absoluteTarget, { recursive: true });
  for (const entry of fs.readdirSync(absoluteSource, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const portablePath = relative ? `${relative}/${entry.name}` : entry.name;
    const sourcePath = path.join(absoluteSource, entry.name);
    const targetPath = path.join(absoluteTarget, entry.name);
    const stats = fs.lstatSync(sourcePath);
    invariant(!stats.isSymbolicLink(), `Backup refused symbolic link or junction ${portablePath}.`);
    if (stats.isDirectory()) copyTreeSafe(source, target, portablePath);
    else {
      invariant(stats.isFile(), `Backup contains unsupported entry ${portablePath}.`);
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function validateTransactionRoot(transactionRoot, runtimeByTarget) {
  invariant(typeof transactionRoot === "string" && path.isAbsolute(transactionRoot), "A supported mutation requires an explicit absolute transactionRoot.");
  const resolved = path.resolve(transactionRoot);
  invariant(resolved !== path.parse(resolved).root, "transactionRoot must not be a filesystem root.");
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stats = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stats) break;
    invariant(!stats.isSymbolicLink(), "transactionRoot must not traverse a symbolic link or junction.");
  }
  for (const runtime of runtimeByTarget.values()) {
    invariant(
      !isWithin(runtime.root, resolved)
      && !isWithin(resolved, runtime.root)
      && resolved !== runtime.root,
      "transactionRoot must remain disjoint from every managed allowed root.",
    );
  }
  const existing = fs.lstatSync(resolved, { throwIfNoEntry: false });
  invariant(!existing || (existing.isDirectory() && !existing.isSymbolicLink()), "transactionRoot must be a real directory when it exists.");
  return resolved;
}

function applyDeclaredChange(change, runtimeByTarget) {
  const runtime = runtimeByTarget.get(change.targetId);
  invariant(runtime, `Unknown management change target ${change.targetId}.`);
  if (change.action === "remove-target") {
    const checked = assertNoSymlinkSegments(runtime.root, runtime.absolutePath, `Change ${change.id}`);
    if (fs.existsSync(checked)) fs.rmSync(checked, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    return;
  }
  const absolutePath = path.resolve(runtime.absolutePath, ...change.path.split("/"));
  const checked = assertNoSymlinkSegments(runtime.root, absolutePath, `Change ${change.id}`);
  invariant(isWithin(runtime.absolutePath, checked), `Change ${change.id} escaped target ${change.targetId}.`);
  if (change.action === "ensure-directory") {
    fs.mkdirSync(checked, { recursive: true });
    return;
  }
  if (change.action === "remove-path") {
    if (fs.existsSync(checked)) fs.rmSync(checked, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    return;
  }
  invariant(change.action === "write-file", `Unsupported declared change ${change.action}.`);
  atomicWriteFile(checked, Buffer.from(change.contentBase64, "base64"));
}

function backupTargets(transactionDirectory, plan, runtimeByTarget, faultInjector) {
  const backupDirectory = path.join(transactionDirectory, "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const entries = [];
  for (const target of plan.targets) {
    faultInjector?.("backup:before-target", { targetId: target.id });
    const runtime = runtimeByTarget.get(target.id);
    const snapshot = readTargetSnapshot(runtime.absolutePath);
    invariant(snapshot.digest === target.expectedDigest, `Target ${target.id} drifted before backup.`);
    const backupTarget = path.join(backupDirectory, target.id);
    if (snapshot.kind === "directory") copyTreeSafe(runtime.absolutePath, backupTarget);
    entries.push({
      targetId: target.id,
      kind: snapshot.kind,
      digest: snapshot.digest,
      backupKey: snapshot.kind === "directory" ? `backups/${target.id}` : null,
    });
    faultInjector?.("backup:after-target", { targetId: target.id });
  }
  const manifest = {
    schemaVersion: 1,
    planId: plan.planId,
    strategy: plan.backup.strategy,
    entries,
  };
  atomicWriteFile(path.join(transactionDirectory, "backup-manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  return manifest;
}

function restoreTargets({ transactionDirectory, plan, runtimeByTarget, backupManifest, faultInjector }) {
  const restored = [];
  const failures = [];
  const entryByTarget = new Map(backupManifest.entries.map((entry) => [entry.targetId, entry]));
  for (const target of [...plan.targets].reverse()) {
    const entry = entryByTarget.get(target.id);
    const runtime = runtimeByTarget.get(target.id);
    try {
      faultInjector?.("rollback:before-target", { targetId: target.id });
      const checked = assertNoSymlinkSegments(runtime.root, runtime.absolutePath, `Rollback ${target.id}`);
      if (fs.existsSync(checked)) fs.rmSync(checked, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
      if (entry.kind === "directory") copyTreeSafe(path.join(transactionDirectory, ...entry.backupKey.split("/")), checked);
      const after = readTargetSnapshot(checked);
      invariant(after.digest === entry.digest, `Rollback digest mismatch for ${target.id}.`);
      restored.push({ targetId: target.id, digest: after.digest });
      faultInjector?.("rollback:after-target", { targetId: target.id });
    } catch (error) {
      failures.push({ targetId: target.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  restored.sort((left, right) => left.targetId.localeCompare(right.targetId, "en"));
  failures.sort((left, right) => left.targetId.localeCompare(right.targetId, "en"));
  return { restored, failures };
}

function createReceiptBase(plan, generatedAt) {
  return {
    schemaVersion: 1,
    receiptId: "",
    planId: plan.planId,
    provider: cloneJson(plan.provider),
    operation: plan.operation,
    generatedAt,
    dryRun: false,
    status: "blocked",
    confirmation: {
      required: true,
      matched: false,
      tokenDigest: sha256(plan.confirmation.token),
    },
    capability: {
      plannedId: plan.capability.capabilityId,
      verifiedId: null,
      state: plan.capability.state,
      evidenceIds: cloneJson(plan.capability.evidenceIds),
    },
    execution: cloneJson(plan.execution),
    preconditions: [],
    impact: cloneJson(plan.impact),
    transaction: {
      id: null,
      backupManifest: null,
      persistedReceipt: false,
    },
    steps: PLAN_STEP_PHASES.map((phase) => ({ phase, state: "planned" })),
    appliedChanges: [],
    rescan: [],
    verification: {
      status: "not-run",
      evidence: [],
    },
    rollback: {
      attempted: false,
      status: "not-needed",
      restored: [],
      failures: [],
    },
    errors: [],
  };
}

function finalizeReceipt(receipt) {
  const payload = cloneJson(receipt);
  payload.receiptId = "";
  receipt.receiptId = contentId("management-receipt", payload);
  validateManagementReceiptV1(receipt);
  return deepFreeze(receipt);
}

function step(receipt, phase, state, detail) {
  const record = receipt.steps.find((entry) => entry.phase === phase);
  invariant(record, `Unknown receipt phase ${phase}.`);
  record.state = state;
  if (detail) record.detail = detail;
}

function blockedReceipt(plan, generatedAt, reason, { dryRun = false, confirmationMatched = false, preconditions = [] } = {}) {
  const receipt = createReceiptBase(plan, generatedAt);
  receipt.dryRun = dryRun;
  receipt.status = "blocked";
  receipt.confirmation.matched = confirmationMatched;
  receipt.preconditions = preconditions;
  receipt.errors.push({ phase: "precondition", code: reason, message: reason });
  step(receipt, "precondition", "blocked", reason);
  for (const phase of PLAN_STEP_PHASES.slice(1)) step(receipt, phase, "skipped");
  return finalizeReceipt(receipt);
}

function persistReceipt(transactionDirectory, receipt) {
  atomicWriteFile(path.join(transactionDirectory, "receipt.json"), Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
}

function sealPersistedReceipt(transactionDirectory, receipt) {
  receipt.transaction.persistedReceipt = true;
  const finalized = finalizeReceipt(receipt);
  persistReceipt(transactionDirectory, finalized);
  return finalized;
}

function normalizeGeneratedAt(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  invariant(Number.isFinite(date.getTime()), "Receipt clock returned an invalid time.");
  return date.toISOString();
}

function providerRescan(provider, plan, runtimeByTarget) {
  const actual = plan.targets.map((target) => ({
    targetId: target.id,
    digest: readTargetSnapshot(runtimeByTarget.get(target.id).absolutePath).digest,
  }));
  const reader = Object.freeze({
    digest(targetId) {
      const record = actual.find((entry) => entry.targetId === targetId);
      invariant(record, `Provider rescan requested unknown target ${targetId}.`);
      return record.digest;
    },
  });
  const reported = provider.rescan({ plan, reader });
  invariant(isRecord(reported) && Array.isArray(reported.targets), `Provider ${provider.id} rescan must return targets.`);
  const normalized = reported.targets.map((entry) => {
    assertAllowedKeys(entry, ["targetId", "digest"], `Provider ${provider.id} rescan target`);
    assertIdentifier(entry.targetId, `Provider ${provider.id} rescan targetId`);
    invariant(DIGEST_PATTERN.test(entry.digest), `Provider ${provider.id} rescan digest is invalid.`);
    return { targetId: entry.targetId, digest: entry.digest };
  }).sort((left, right) => left.targetId.localeCompare(right.targetId, "en"));
  invariant(stableJson(normalized) === stableJson(actual), `Provider ${provider.id} rescan does not match Core observation.`);
  return actual;
}

function providerVerification(provider, plan, rescan) {
  for (const target of plan.targets) {
    const actual = rescan.find((entry) => entry.targetId === target.id);
    if (target.expectedAfterDigest !== "provider-verified") {
      invariant(actual?.digest === target.expectedAfterDigest, `Post-action digest verification failed for ${target.id}.`);
    }
  }
  const result = provider.verify({ plan, observation: { targets: cloneJson(rescan) } });
  if (result === true) return { ok: true, evidence: [] };
  invariant(isRecord(result), `Provider ${provider.id} verify must return a boolean or object.`);
  assertAllowedKeys(result, ["ok", "evidence", "message"], `Provider ${provider.id} verification`);
  invariant(result.ok === true, result.message || `Provider ${provider.id} verification failed.`);
  invariant(Array.isArray(result.evidence ?? []), `Provider ${provider.id} verification evidence must be an array.`);
  return { ok: true, evidence: cloneJson(result.evidence ?? []) };
}

export function executeManagementPlanV1({
  plan,
  provider,
  allowedRoots = {},
  transactionRoot,
  confirmation,
  dryRun = false,
  clock = () => new Date(),
  faultInjector,
} = {}) {
  validateManagementPlanV1(plan);
  validateProviderShape(provider);
  invariant(typeof dryRun === "boolean", "dryRun must be boolean.");
  if (faultInjector !== undefined) invariant(typeof faultInjector === "function", "faultInjector must be a function.");
  const generatedAt = normalizeGeneratedAt(clock);
  if (provider.id !== plan.provider.id || provider.kind !== plan.provider.kind) {
    return blockedReceipt(plan, generatedAt, "provider-mismatch", { dryRun });
  }
  if (!plan.executable) return blockedReceipt(plan, generatedAt, plan.blockers[0] ?? "plan-not-executable", { dryRun });
  if (provider.capability.capabilityId !== plan.capability.capabilityId || capabilityDigest(provider.capability) !== plan.capability.digest) {
    return blockedReceipt(plan, generatedAt, "capability-drift", { dryRun });
  }

  let probe;
  try {
    probe = verifySupportedProbe(provider, plan.operation);
  } catch {
    return blockedReceipt(plan, generatedAt, "capability-probe-failed", { dryRun });
  }
  if (!dryRun && confirmation !== plan.confirmation.token) {
    return blockedReceipt(plan, generatedAt, "exact-confirmation-required", { confirmationMatched: false });
  }

  const runtimeByTarget = new Map();
  const preconditions = [{
    id: "capability-supported",
    state: "passed",
    expected: "supported",
    actual: probe.state,
  }];
  try {
    for (const target of plan.targets) {
      const runtime = resolveTargetRuntime(target, allowedRoots);
      const snapshot = readTargetSnapshot(runtime.absolutePath);
      runtimeByTarget.set(target.id, { ...runtime, target, snapshot });
      preconditions.push({
        id: `allowed-root-${target.id}`,
        state: "passed",
        targetId: target.id,
        rootId: target.rootId,
      });
      preconditions.push({
        id: `digest-${target.id}`,
        state: snapshot.digest === target.expectedDigest ? "passed" : "failed",
        targetId: target.id,
        expectedDigest: target.expectedDigest,
        actualDigest: snapshot.digest,
      });
      if (snapshot.digest !== target.expectedDigest) {
        return blockedReceipt(plan, generatedAt, "target-digest-drift", {
          dryRun,
          confirmationMatched: dryRun ? false : true,
          preconditions,
        });
      }
    }
  } catch {
    return blockedReceipt(plan, generatedAt, "allowed-root-precondition-failed", {
      dryRun,
      confirmationMatched: dryRun ? false : true,
      preconditions,
    });
  }

  if (dryRun) {
    const receipt = createReceiptBase(plan, generatedAt);
    receipt.dryRun = true;
    receipt.status = "dry-run";
    receipt.capability.verifiedId = probe.capabilityId;
    receipt.preconditions = preconditions;
    step(receipt, "precondition", "passed", "All read-only preconditions matched.");
    for (const phase of ["backup", "apply", "rescan", "verify", "rollback"]) step(receipt, phase, "planned");
    step(receipt, "receipt", "completed", "Returned in memory; no receipt file was written.");
    receipt.verification.status = "planned";
    receipt.rollback.status = "planned";
    return finalizeReceipt(receipt);
  }

  const receipt = createReceiptBase(plan, generatedAt);
  receipt.confirmation.matched = true;
  receipt.capability.verifiedId = probe.capabilityId;
  receipt.preconditions = preconditions;
  step(receipt, "precondition", "passed");
  const resolvedTransactionRoot = validateTransactionRoot(transactionRoot, runtimeByTarget);
  const transactionId = contentId("transaction", { planId: plan.planId, generatedAt });
  const transactionDirectory = path.join(resolvedTransactionRoot, transactionId);
  invariant(!fs.existsSync(transactionDirectory), `Transaction ${transactionId} already exists.`);
  fs.mkdirSync(transactionDirectory, { recursive: true });
  receipt.transaction.id = transactionId;

  const replacements = [
    [resolvedTransactionRoot, "<transaction-root>"],
    ...[...runtimeByTarget.entries()].flatMap(([targetId, runtime]) => [
      [runtime.absolutePath, `<target:${targetId}>`],
      [runtime.root, `<root:${runtime.target.rootId}>`],
    ]),
  ].sort((left, right) => right[0].length - left[0].length);

  let backupManifest;
  let applyStarted = false;
  let currentPhase = "backup";
  try {
    faultInjector?.("transaction:before-backup", { planId: plan.planId });
    backupManifest = backupTargets(transactionDirectory, plan, runtimeByTarget, faultInjector);
    receipt.transaction.backupManifest = cloneJson(backupManifest);
    step(receipt, "backup", "completed");

    applyStarted = true;
    currentPhase = "apply";
    faultInjector?.("transaction:before-apply", { planId: plan.planId });
    if (plan.execution.mode === "trusted-external-manager") {
      const external = deepFreeze({
        roots: Object.fromEntries([...runtimeByTarget.values()].map((runtime) => [runtime.target.rootId, runtime.root])),
        targets: Object.fromEntries([...runtimeByTarget.entries()].map(([targetId, runtime]) => [targetId, runtime.absolutePath])),
      });
      provider.apply({ plan, external });
    } else {
      let nextChangeIndex = 0;
      const writer = Object.freeze({
        apply(changeId) {
          const expected = plan.changes[nextChangeIndex];
          invariant(expected, `Provider ${provider.id} attempted an undeclared extra write.`);
          invariant(changeId === expected.id, `Provider ${provider.id} must apply declared changes in plan order.`);
          faultInjector?.("apply:before-change", { changeId });
          applyDeclaredChange(expected, runtimeByTarget);
          receipt.appliedChanges.push(changeId);
          nextChangeIndex += 1;
          faultInjector?.("apply:after-change", { changeId });
        },
      });
      provider.apply({ plan, writer });
      invariant(nextChangeIndex === plan.changes.length, `Provider ${provider.id} did not apply every declared change.`);
    }
    step(receipt, "apply", "completed");

    currentPhase = "rescan";
    faultInjector?.("transaction:before-rescan", { planId: plan.planId });
    receipt.rescan = providerRescan(provider, plan, runtimeByTarget);
    step(receipt, "rescan", "completed");

    currentPhase = "verify";
    faultInjector?.("transaction:before-verify", { planId: plan.planId });
    const verification = providerVerification(provider, plan, receipt.rescan);
    receipt.verification = {
      status: "passed",
      evidence: verification.evidence,
    };
    step(receipt, "verify", "completed");
    step(receipt, "rollback", "skipped", "Verification passed.");
    receipt.status = "succeeded";
    receipt.rollback.status = "not-needed";
    step(receipt, "receipt", "completed");
    return sealPersistedReceipt(transactionDirectory, receipt);
  } catch (error) {
    receipt.errors.push({
      phase: currentPhase,
      code: "transaction-failure",
      message: sanitizeError(error, replacements),
    });
    if (!backupManifest || !applyStarted) {
      receipt.status = "failed";
      receipt.verification.status = "failed";
      step(receipt, currentPhase, "failed");
      for (const pending of receipt.steps.filter((entry) => entry.state === "planned")) pending.state = "skipped";
      step(receipt, "receipt", "completed");
      return sealPersistedReceipt(transactionDirectory, receipt);
    }

    if (receipt.steps.find((entry) => entry.phase === "apply")?.state === "planned") step(receipt, "apply", "failed");
    else if (receipt.steps.find((entry) => entry.phase === "rescan")?.state === "planned") step(receipt, "rescan", "failed");
    else if (receipt.steps.find((entry) => entry.phase === "verify")?.state === "planned") step(receipt, "verify", "failed");
    receipt.verification.status = "failed";
    receipt.rollback.attempted = true;
    const restored = restoreTargets({ transactionDirectory, plan, runtimeByTarget, backupManifest, faultInjector });
    receipt.rollback.restored = restored.restored;
    receipt.rollback.failures = restored.failures.map((failure) => ({
      targetId: failure.targetId,
      message: sanitizeError(failure.message, replacements),
    }));
    if (receipt.rollback.failures.length === 0 && receipt.rollback.restored.length === plan.targets.length) {
      receipt.status = "rolled-back";
      receipt.rollback.status = "succeeded";
      step(receipt, "rollback", "completed", "All pre-action digests were restored.");
    } else {
      receipt.status = "rollback-failed";
      receipt.rollback.status = "failed";
      step(receipt, "rollback", "failed", "At least one pre-action digest was not restored.");
      receipt.errors.push({
        phase: "rollback",
        code: "rollback-failed",
        message: "Rollback failed; the transaction must not be treated as successful.",
      });
    }
    for (const pending of receipt.steps.filter((entry) => entry.state === "planned")) pending.state = "skipped";
    step(receipt, "receipt", "completed");
    return sealPersistedReceipt(transactionDirectory, receipt);
  }
}

export function validateManagementReceiptV1(receipt) {
  assertAllowedKeys(receipt, ["schemaVersion", "receiptId", "planId", "provider", "operation", "generatedAt", "dryRun", "status", "confirmation", "capability", "execution", "preconditions", "impact", "transaction", "steps", "appliedChanges", "rescan", "verification", "rollback", "errors"], "ManagementReceiptV1");
  invariant(receipt.schemaVersion === 1, "ManagementReceiptV1 schemaVersion must be 1.");
  assertIdentifier(receipt.receiptId, "ManagementReceiptV1 receiptId");
  assertIdentifier(receipt.planId, "ManagementReceiptV1 planId");
  assertAllowedKeys(receipt.provider, ["id", "kind", "label"], "ManagementReceiptV1 provider");
  assertIdentifier(receipt.provider.id, "ManagementReceiptV1 provider id");
  invariant(OPERATION_SET.has(receipt.operation), "ManagementReceiptV1 operation is invalid.");
  invariant(Number.isFinite(Date.parse(receipt.generatedAt)), "ManagementReceiptV1 generatedAt is invalid.");
  invariant(typeof receipt.dryRun === "boolean", "ManagementReceiptV1 dryRun must be boolean.");
  invariant(RECEIPT_STATUSES.has(receipt.status), "ManagementReceiptV1 status is invalid.");
  assertAllowedKeys(receipt.confirmation, ["required", "matched", "tokenDigest"], "ManagementReceiptV1 confirmation");
  invariant(receipt.confirmation.required === true && typeof receipt.confirmation.matched === "boolean" && DIGEST_PATTERN.test(receipt.confirmation.tokenDigest), "ManagementReceiptV1 confirmation is invalid.");
  assertAllowedKeys(receipt.capability, ["plannedId", "verifiedId", "state", "evidenceIds"], "ManagementReceiptV1 capability");
  assertIdentifier(receipt.capability.plannedId, "ManagementReceiptV1 planned capability");
  invariant(receipt.capability.verifiedId === null || IDENTIFIER_PATTERN.test(receipt.capability.verifiedId), "ManagementReceiptV1 verified capability is invalid.");
  invariant(CAPABILITY_STATE_SET.has(receipt.capability.state), "ManagementReceiptV1 capability state is invalid.");
  validateExecutionContract(receipt.execution, "ManagementReceiptV1 execution");
  invariant(Array.isArray(receipt.preconditions), "ManagementReceiptV1 preconditions must be an array.");
  assertAllowedKeys(receipt.transaction, ["id", "backupManifest", "persistedReceipt"], "ManagementReceiptV1 transaction");
  invariant(receipt.transaction.id === null || IDENTIFIER_PATTERN.test(receipt.transaction.id), "ManagementReceiptV1 transaction id is invalid.");
  invariant(typeof receipt.transaction.persistedReceipt === "boolean", "ManagementReceiptV1 persistedReceipt must be boolean.");
  invariant(Array.isArray(receipt.steps) && receipt.steps.length === PLAN_STEP_PHASES.length, "ManagementReceiptV1 steps are incomplete.");
  invariant(JSON.stringify(receipt.steps.map((entry) => entry.phase)) === JSON.stringify(PLAN_STEP_PHASES), "ManagementReceiptV1 step order is invalid.");
  invariant(receipt.steps.every((entry) => RECEIPT_STEP_STATES.has(entry.state)), "ManagementReceiptV1 step state is invalid.");
  invariant(Array.isArray(receipt.appliedChanges) && Array.isArray(receipt.rescan) && Array.isArray(receipt.errors), "ManagementReceiptV1 arrays are invalid.");
  assertAllowedKeys(receipt.verification, ["status", "evidence"], "ManagementReceiptV1 verification");
  invariant(["not-run", "planned", "passed", "failed"].includes(receipt.verification.status), "ManagementReceiptV1 verification status is invalid.");
  assertAllowedKeys(receipt.rollback, ["attempted", "status", "restored", "failures"], "ManagementReceiptV1 rollback");
  invariant(typeof receipt.rollback.attempted === "boolean", "ManagementReceiptV1 rollback attempted is invalid.");
  invariant(["not-needed", "planned", "succeeded", "failed"].includes(receipt.rollback.status), "ManagementReceiptV1 rollback status is invalid.");
  if (receipt.status === "succeeded") {
    invariant(receipt.verification.status === "passed" && receipt.rollback.status === "not-needed", "A successful ManagementReceiptV1 must be verified without rollback.");
  }
  if (receipt.status === "rolled-back") {
    invariant(receipt.rollback.attempted && receipt.rollback.status === "succeeded" && receipt.rollback.failures.length === 0, "A rolled-back ManagementReceiptV1 must prove restoration.");
  }
  if (receipt.status === "rollback-failed") {
    invariant(receipt.rollback.attempted && receipt.rollback.status === "failed" && receipt.rollback.failures.length > 0, "A rollback-failed ManagementReceiptV1 must expose failures.");
  }
  const identityPayload = cloneJson(receipt);
  identityPayload.receiptId = "";
  invariant(receipt.receiptId === contentId("management-receipt", identityPayload), "ManagementReceiptV1 receiptId is stale.");
  return receipt;
}
