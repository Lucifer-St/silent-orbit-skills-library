import { createHash } from "node:crypto";

const RELEASE_STATES = new Set(["pending", "pass", "blocked"]);
const PRIVATE_IDENTIFIERS = [["mat", "thew"].join(""), ["feng", "xue"].join("")];
const PRIVATE_PATTERNS = [
  /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /bearer\s+[A-Za-z0-9._-]{12,}/i,
];
const SECRET_PREFIXES = [["github", "pat"].join("_") + "_", ["gh", "p_"].join("")];
const LONG_SECRET = new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9_-]{12,}`, "i");

function invariant(condition, message) {
  if (!condition) throw new Error(`Phase 1E Alpha receipt violation: ${message}`);
}

function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function digest(value) { return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex"); }

export function containsPhase1EPrivateEvidence(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return SECRET_PREFIXES.some((prefix) => text.includes(prefix))
    || LONG_SECRET.test(text)
    || PRIVATE_IDENTIFIERS.some((identifier) => text.toLowerCase().includes(identifier))
    || PRIVATE_PATTERNS.some((pattern) => pattern.test(text));
}

function validateDiff(value, label) {
  invariant(isRecord(value), `${label} must be an object.`);
  invariant(Array.isArray(value.added) && Array.isArray(value.changed) && Array.isArray(value.removed), `${label} needs added, changed, and removed arrays.`);
  invariant(isRecord(value.summary), `${label}.summary is required.`);
  invariant(value.summary.added === value.added.length && value.summary.changed === value.changed.length && value.summary.removed === value.removed.length, `${label}.summary is stale.`);
}

function validateRun(value, label) {
  invariant(isRecord(value), `${label} must be an object.`);
  for (const key of ["generatedAt", "inventorySnapshotId", "librarySnapshotId", "siteManifestDigest", "distDigest", "doctorStatus"]) invariant(value[key] !== undefined, `${label}.${key} is required.`);
  invariant(!Number.isNaN(Date.parse(value.generatedAt)), `${label}.generatedAt is invalid.`);
  invariant(value.doctorStatus === "ok", `${label}.doctorStatus must be ok.`);
}

export function validatePhase1EAlphaReceiptV1(receipt) {
  invariant(isRecord(receipt) && receipt.schemaVersion === 1, "schemaVersion must be 1.");
  invariant(receipt.humanFeedback === false, "humanFeedback must remain false for the fixed independent environment.");
  invariant(isRecord(receipt.environment) && receipt.environment.kind === "fixed-independent", "environment must be fixed-independent.");
  invariant(receipt.environment.execution === "installed-npm-tarball", "environment execution must use the installed npm tarball.");
  invariant(/^https:\/\//.test(receipt.environment.repository) && typeof receipt.environment.commit === "string" && typeof receipt.environment.selectionDigest === "string", "environment provenance is incomplete.");
  invariant(Array.isArray(receipt.environment.license) && receipt.environment.license.length > 0, "environment license is required.");
  invariant(JSON.stringify(receipt.counts) === JSON.stringify({ observed: 48, inventory: 46, public: 44, reviewRequired: 2, localOnly: 2 }), "counts must be 48/46/44/2/2.");
  validateRun(receipt.v1, "v1"); validateRun(receipt.v2, "v2"); validateDiff(receipt.diff, "diff"); validateDiff(receipt.postGenerateDiff, "postGenerateDiff");
  invariant(JSON.stringify(receipt.diff.summary) === JSON.stringify({ added: 1, changed: 3, removed: 1 }), "V2 diff must be 1/3/1.");
  invariant(JSON.stringify(receipt.postGenerateDiff.summary) === JSON.stringify({ added: 0, changed: 0, removed: 0 }), "post-generate diff must be empty.");
  invariant(receipt.privacy?.status === "pass" && receipt.privacy?.forbiddenFindings === 0, "privacy gate must pass with zero findings.");
  invariant(JSON.stringify(receipt.compatibility) === JSON.stringify({ skills: 142, libraries: 28, categories: 9 }), "legacy compatibility counts changed.");
  invariant(isRecord(receipt.release) && receipt.release.productionChanged === false, "Production must remain unchanged.");
  for (const key of ["privateGates", "publicRc", "releaseGate", "deployPreview"]) invariant(RELEASE_STATES.has(receipt.release[key]), `release.${key} is invalid.`);
  const body = structuredClone(receipt); delete body.receiptId;
  invariant(receipt.receiptId === digest(body), "receiptId is stale.");
  invariant(!containsPhase1EPrivateEvidence(receipt), "receipt contains private evidence.");
  return receipt;
}

export function createPhase1EAlphaReceiptV1(value) {
  const body = { schemaVersion: 1, ...value };
  return validatePhase1EAlphaReceiptV1({ ...body, receiptId: digest(body) });
}

export function phase1EDigest(value) { return digest(value); }
