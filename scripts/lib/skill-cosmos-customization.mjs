import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUSTOMIZATION_MANAGED_FILES_V2,
  validateFrontendHandoffV2,
} from "./generator-contracts.mjs";
import { resolveProjectRoot } from "./silent-orbit-project.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "../..");
const REFERENCE_TEMPLATE = path.join(packageRoot, "templates", "reference-index-v1");
const PRIVATE_ROOT = path.join(".silent-orbit", "customization");
const PROFILE_FILE = path.join(PRIVATE_ROOT, "design-profile.v2.json");
const STATE_FILE = path.join(PRIVATE_ROOT, "state.v2.json");
const RECEIPTS_DIR = path.join(PRIVATE_ROOT, "receipts");
const OUTPUT_ROOT = "customization";
const ROUNDS_ROOT = path.join(OUTPUT_ROOT, "rounds");
const CURRENT_ROOT = path.join(OUTPUT_ROOT, "current");
const MANIFEST_FILE = "custom-frontend.manifest.json";
const DIRECTION_FILE = "direction-preview.json";
const STYLE_FILE = "customization.css";
const FRONTEND_HANDOFF_FILE = "frontend-handoff.v2.json";
const SITE_DATA_FILE = "site-data.json";
const TRANSIENT_IO_CODES = new Set(["EACCES", "EBUSY", "EIO", "ENOTEMPTY", "EPERM"]);
const RETRY_DELAYS_MS = Object.freeze([25, 50, 100, 200, 400]);
const DIRECTION_ENUMS = Object.freeze({
  layout: new Set(["editorial-rail", "signal-grid"]),
  density: new Set(["airy", "balanced", "compact"]),
  typography: new Set(["editorial", "technical", "humanist"]),
  motion: new Set(["still", "measured", "expressive"]),
  shape: new Set(["square", "soft"]),
});
const STRUCTURAL_DIRECTION_KEYS = Object.freeze(["layout", "density", "typography", "motion", "shape"]);
const PRIVATE_TOKEN_PREFIXES = Object.freeze([
  ["gh", "p_"].join(""),
  ["github", "_pat_"].join(""),
]);
const PRIVATE_PATTERN = new RegExp(
  `(?:[A-Za-z]:\\\\Users\\\\|\\/Users\\/|\\/home\\/|file:\\/\\/|\\b(?:${PRIVATE_TOKEN_PREFIXES.join("|")})[A-Za-z0-9_-]{8,}|bearer\\s+[A-Za-z0-9._-]{12,})`,
  "i",
);

function invariant(condition, message) {
  if (!condition) throw new Error(`Silent Orbit customization violation: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateAllowedKeys(record, keys, label) {
  invariant(isRecord(record), `${label} must be an object.`);
  const allowed = new Set(keys);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  invariant(unexpected.length === 0, `${label} has unsupported fields: ${unexpected.join(", ")}.`);
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function portableId(value, label) {
  const normalized = String(value ?? "").normalize("NFKC").toLowerCase();
  invariant(/^[a-z0-9][a-z0-9.-]*$/.test(normalized), `${label} must be a portable lowercase id.`);
  return normalized;
}

function snapshotRef(value, label) {
  const normalized = safeString(value, label, 240);
  invariant(/^[a-z0-9][a-z0-9:._-]*$/i.test(normalized), `${label} is not a valid snapshot reference.`);
  return normalized;
}

function timestamp(value, label) {
  invariant(typeof value === "string" && !Number.isNaN(Date.parse(value)), `${label} must be an ISO timestamp.`);
  return value;
}

function safeString(value, label, maximum = 500) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} is required.`);
  const trimmed = value.trim();
  invariant(trimmed.length <= maximum, `${label} is too long.`);
  invariant(!PRIVATE_PATTERN.test(trimmed), `${label} contains private path or secret-like evidence.`);
  return trimmed;
}

function safeStrings(value, label, maximum = 240) {
  invariant(Array.isArray(value), `${label} must be an array.`);
  const normalized = value.map((entry, index) => safeString(entry, `${label}[${index}]`, maximum));
  invariant(new Set(normalized).size === normalized.length, `${label} must not contain duplicates.`);
  return normalized;
}

function readJson(target, label) {
  invariant(fs.existsSync(target), `${label} is missing.`);
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`Silent Orbit customization violation: ${label} is not valid JSON: ${error.message}`);
  }
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveProjectPath(projectRoot, relativePath, label) {
  invariant(typeof relativePath === "string" && relativePath.length > 0 && !path.isAbsolute(relativePath), `${label} must be project-relative.`);
  const target = path.resolve(projectRoot, relativePath);
  invariant(isWithin(projectRoot, target), `${label} escapes the project root.`);
  return target;
}

function waitSynchronously(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function retryTransientIo(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (!TRANSIENT_IO_CODES.has(String(error?.code ?? "").toUpperCase()) || delay === undefined) throw error;
      waitSynchronously(delay);
    }
  }
}

function removePath(target) {
  if (!fs.existsSync(target)) return;
  retryTransientIo(() => fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
}

function renamePath(source, target) {
  retryTransientIo(() => fs.renameSync(source, target));
}

function atomicWriteText(target, value) {
  retryTransientIo(() => fs.mkdirSync(path.dirname(target), { recursive: true }));
  const temporary = `${target}.tmp-${process.pid}`;
  const backup = `${target}.bak-${process.pid}`;
  retryTransientIo(() => fs.writeFileSync(temporary, value, "utf8"));
  let backedUp = false;
  try {
    if (fs.existsSync(backup)) removePath(backup);
    if (fs.existsSync(target)) {
      renamePath(target, backup);
      backedUp = true;
    }
    renamePath(temporary, target);
    if (backedUp) removePath(backup);
  } catch (error) {
    if (!fs.existsSync(target) && backedUp && fs.existsSync(backup)) renamePath(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(temporary)) removePath(temporary);
  }
}

function atomicWriteJson(target, value) {
  atomicWriteText(target, stableJson(value));
}

function replaceDirectory(projectRoot, staged, target, identity) {
  invariant(isWithin(projectRoot, staged) && isWithin(projectRoot, target), "directory replacement escaped the project.");
  const backup = resolveProjectPath(projectRoot, path.join(PRIVATE_ROOT, "transactions", `${identity}-backup`), "customization backup");
  if (fs.existsSync(backup)) removePath(backup);
  let backedUp = false;
  try {
    retryTransientIo(() => fs.mkdirSync(path.dirname(backup), { recursive: true }));
    if (fs.existsSync(target)) {
      renamePath(target, backup);
      backedUp = true;
    }
    renamePath(staged, target);
    if (backedUp) removePath(backup);
  } catch (error) {
    if (fs.existsSync(target)) removePath(target);
    if (backedUp && fs.existsSync(backup)) renamePath(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(staged)) removePath(staged);
  }
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const target = path.join(directory, entry.name);
      invariant(!entry.isSymbolicLink(), "custom frontend cannot contain symbolic links.");
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  visit(root);
  return files;
}

function styleDigest(root) {
  const excluded = new Set([...CUSTOMIZATION_MANAGED_FILES_V2, MANIFEST_FILE]);
  const hash = createHash("sha256");
  for (const target of listFiles(root)) {
    const relative = path.relative(root, target).split(path.sep).join("/");
    if (excluded.has(relative)) continue;
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(target));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function validatePublicOutput(root) {
  for (const relative of ["index.html", "styles.css", "app.js", SITE_DATA_FILE, FRONTEND_HANDOFF_FILE, STYLE_FILE, DIRECTION_FILE, MANIFEST_FILE]) {
    invariant(fs.existsSync(path.join(root, relative)), `custom frontend is missing ${relative}.`);
  }
  const payload = listFiles(root)
    .filter((target) => /\.(?:css|html|js|json|md)$/i.test(target))
    .map((target) => fs.readFileSync(target, "utf8"))
    .join("\n");
  invariant(!PRIVATE_PATTERN.test(payload), "custom frontend contains private path or secret-like evidence.");
  return true;
}

function validateColor(value, label) {
  invariant(typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value), `${label} must be a six-digit hex color.`);
  return value.toLowerCase();
}

export function validateDesignProfileV2(profile) {
  validateAllowedKeys(profile, ["schemaVersion", "kind", "profileId", "revision", "createdAt", "updatedAt", "preferences"], "DesignProfileV2");
  invariant(profile.schemaVersion === 2 && profile.kind === "DesignProfileV2", "DesignProfileV2 identity is invalid.");
  portableId(profile.profileId, "DesignProfileV2.profileId");
  invariant(Number.isInteger(profile.revision) && profile.revision >= 1, "DesignProfileV2.revision is invalid.");
  timestamp(profile.createdAt, "DesignProfileV2.createdAt");
  timestamp(profile.updatedAt, "DesignProfileV2.updatedAt");
  validateAllowedKeys(profile.preferences, [
    "references",
    "antiReferences",
    "qualities",
    "density",
    "navigation",
    "typography",
    "colorIntent",
    "motion",
    "accessibility",
  ], "DesignProfileV2.preferences");
  safeStrings(profile.preferences.references, "DesignProfileV2.references");
  safeStrings(profile.preferences.antiReferences, "DesignProfileV2.antiReferences");
  safeStrings(profile.preferences.qualities, "DesignProfileV2.qualities");
  invariant(DIRECTION_ENUMS.density.has(profile.preferences.density), "DesignProfileV2 density is invalid.");
  invariant(new Set(["map-first", "library-first", "balanced"]).has(profile.preferences.navigation), "DesignProfileV2 navigation is invalid.");
  invariant(DIRECTION_ENUMS.typography.has(profile.preferences.typography), "DesignProfileV2 typography is invalid.");
  safeStrings(profile.preferences.colorIntent, "DesignProfileV2.colorIntent");
  invariant(DIRECTION_ENUMS.motion.has(profile.preferences.motion), "DesignProfileV2 motion is invalid.");
  validateAllowedKeys(profile.preferences.accessibility, ["highContrast", "reducedMotion", "mobilePriority"], "DesignProfileV2.accessibility");
  invariant(typeof profile.preferences.accessibility.highContrast === "boolean", "DesignProfileV2 highContrast is invalid.");
  invariant(typeof profile.preferences.accessibility.reducedMotion === "boolean", "DesignProfileV2 reducedMotion is invalid.");
  invariant(new Set(["essential", "equal", "desktop-led"]).has(profile.preferences.accessibility.mobilePriority), "DesignProfileV2 mobilePriority is invalid.");
  invariant(!PRIVATE_PATTERN.test(JSON.stringify(profile)), "DesignProfileV2 contains private path or secret-like evidence.");
  return profile;
}

function validateDirectionSpec(direction, label = "direction") {
  validateAllowedKeys(direction, ["id", "label", "rationale", "layout", "density", "typography", "motion", "shape", "palette"], label);
  if (direction.id !== undefined) portableId(direction.id, `${label}.id`);
  safeString(direction.label, `${label}.label`, 80);
  safeString(direction.rationale, `${label}.rationale`, 500);
  for (const key of STRUCTURAL_DIRECTION_KEYS) invariant(DIRECTION_ENUMS[key].has(direction[key]), `${label}.${key} is invalid.`);
  validateAllowedKeys(direction.palette, ["paper", "ink", "muted", "line", "accent"], `${label}.palette`);
  for (const key of ["paper", "ink", "muted", "line", "accent"]) validateColor(direction.palette[key], `${label}.palette.${key}`);
  invariant(direction.palette.paper.toLowerCase() !== direction.palette.ink.toLowerCase(), `${label} needs contrasting paper and ink colors.`);
  invariant(!PRIVATE_PATTERN.test(JSON.stringify(direction)), `${label} contains private path or secret-like evidence.`);
  return direction;
}

function directionIdentity(direction) {
  return direction.id ?? `direction-${sha256(stableJson(direction)).slice(0, 12)}`;
}

function materialDirection(direction, { createdAt, revision = 1, parentDirectionId = null, status = "candidate" } = {}) {
  validateDirectionSpec(direction);
  return {
    id: portableId(directionIdentity(direction), "direction.id"),
    label: direction.label.trim(),
    rationale: direction.rationale.trim(),
    layout: direction.layout,
    density: direction.density,
    typography: direction.typography,
    motion: direction.motion,
    shape: direction.shape,
    palette: Object.fromEntries(Object.entries(direction.palette).map(([key, value]) => [key, value.toLowerCase()])),
    revision,
    parentDirectionId,
    status,
    createdAt,
  };
}

function assertDirectionPair(directions, label = "directions") {
  invariant(Array.isArray(directions) && directions.length === 2, `${label} must contain exactly two directions.`);
  directions.forEach((direction, index) => validateDirectionSpec(direction, `${label}[${index}]`));
  const ids = directions.map(directionIdentity);
  invariant(new Set(ids).size === 2, `${label} ids must be unique.`);
  const structuralDifferences = STRUCTURAL_DIRECTION_KEYS.filter((key) => directions[0][key] !== directions[1][key]);
  invariant(structuralDifferences.length >= 2, `${label} must differ on at least two structural axes, not only color.`);
}

function validateMaterialDirection(direction, label) {
  validateAllowedKeys(direction, [
    "id",
    "label",
    "rationale",
    "layout",
    "density",
    "typography",
    "motion",
    "shape",
    "palette",
    "revision",
    "parentDirectionId",
    "status",
    "createdAt",
  ], label);
  validateDirectionSpec({
    id: direction.id,
    label: direction.label,
    rationale: direction.rationale,
    layout: direction.layout,
    density: direction.density,
    typography: direction.typography,
    motion: direction.motion,
    shape: direction.shape,
    palette: direction.palette,
  }, label);
  invariant(Number.isInteger(direction.revision) && direction.revision >= 1, `${label}.revision is invalid.`);
  if (direction.parentDirectionId !== null) portableId(direction.parentDirectionId, `${label}.parentDirectionId`);
  invariant(new Set(["candidate", "rejected", "superseded", "selected"]).has(direction.status), `${label}.status is invalid.`);
  timestamp(direction.createdAt, `${label}.createdAt`);
  return direction;
}

export function validateCustomizationStateV2(state) {
  validateAllowedKeys(state, ["schemaVersion", "kind", "projectId", "profileRef", "createdAt", "updatedAt", "rounds", "current"], "CustomizationStateV2");
  invariant(state.schemaVersion === 2 && state.kind === "CustomizationStateV2", "CustomizationStateV2 identity is invalid.");
  portableId(state.projectId, "CustomizationStateV2.projectId");
  validateAllowedKeys(state.profileRef, ["profileId", "revision"], "CustomizationStateV2.profileRef");
  portableId(state.profileRef.profileId, "CustomizationStateV2.profileRef.profileId");
  invariant(Number.isInteger(state.profileRef.revision) && state.profileRef.revision >= 1, "CustomizationStateV2 profile revision is invalid.");
  timestamp(state.createdAt, "CustomizationStateV2.createdAt");
  timestamp(state.updatedAt, "CustomizationStateV2.updatedAt");
  invariant(Array.isArray(state.rounds) && state.rounds.length > 0, "CustomizationStateV2 needs at least one round.");
  const roundIds = new Set();
  const directionIds = new Set();
  for (const [roundIndex, round] of state.rounds.entries()) {
    const label = `CustomizationStateV2.rounds[${roundIndex}]`;
    validateAllowedKeys(round, ["id", "createdAt", "status", "inheritedFeedback", "directions", "decisions"], label);
    portableId(round.id, `${label}.id`);
    invariant(!roundIds.has(round.id), "CustomizationStateV2 round ids must be unique.");
    roundIds.add(round.id);
    timestamp(round.createdAt, `${label}.createdAt`);
    invariant(new Set(["open", "closed", "selected"]).has(round.status), `${label}.status is invalid.`);
    safeStrings(round.inheritedFeedback, `${label}.inheritedFeedback`, 500);
    invariant(Array.isArray(round.directions) && round.directions.length >= 2, `${label} needs direction history.`);
    const roots = round.directions.filter((direction) => direction.parentDirectionId === null);
    invariant(roots.length === 2, `${label} must begin with exactly two directions.`);
    for (const [directionIndex, direction] of round.directions.entries()) {
      validateMaterialDirection(direction, `${label}.directions[${directionIndex}]`);
      invariant(!directionIds.has(direction.id), "CustomizationStateV2 direction ids must be globally unique.");
      directionIds.add(direction.id);
    }
    const active = round.directions.filter((direction) => direction.status === "candidate");
    invariant(active.length <= 2, `${label} has more than two active directions.`);
    invariant(Array.isArray(round.decisions), `${label}.decisions must be an array.`);
    const decisionIds = new Set();
    for (const [decisionIndex, decision] of round.decisions.entries()) {
      const decisionLabel = `${label}.decisions[${decisionIndex}]`;
      validateAllowedKeys(decision, ["id", "action", "directionId", "feedback", "createdAt"], decisionLabel);
      portableId(decision.id, `${decisionLabel}.id`);
      invariant(!decisionIds.has(decision.id), `${label} decision ids must be unique.`);
      decisionIds.add(decision.id);
      invariant(new Set(["keep", "adjust", "reject", "redo"]).has(decision.action), `${decisionLabel}.action is invalid.`);
      if (decision.directionId !== null) portableId(decision.directionId, `${decisionLabel}.directionId`);
      safeStrings(decision.feedback, `${decisionLabel}.feedback`, 500);
      timestamp(decision.createdAt, `${decisionLabel}.createdAt`);
    }
  }
  invariant(state.rounds.filter((round) => round.status === "open").length <= 1, "CustomizationStateV2 has multiple open rounds.");
  if (state.current !== null) {
    validateAllowedKeys(state.current, ["roundId", "directionId", "outputDirectory", "styleDigest"], "CustomizationStateV2.current");
    invariant(roundIds.has(state.current.roundId), "CustomizationStateV2 current round is missing.");
    invariant(directionIds.has(state.current.directionId), "CustomizationStateV2 current direction is missing.");
    invariant(state.current.outputDirectory === "customization/current", "CustomizationStateV2 current output directory is invalid.");
    invariant(/^[a-f0-9]{64}$/.test(state.current.styleDigest), "CustomizationStateV2 current style digest is invalid.");
    const selected = state.rounds.flatMap((round) => round.directions).find((direction) => direction.id === state.current.directionId);
    invariant(selected?.status === "selected", "CustomizationStateV2 current direction is not selected.");
  }
  invariant(!PRIVATE_PATTERN.test(JSON.stringify(state)), "CustomizationStateV2 contains private path or secret-like evidence.");
  return state;
}

export function validateCustomFrontendManifestV2(manifest) {
  validateAllowedKeys(manifest, [
    "schemaVersion",
    "kind",
    "projectId",
    "profileRef",
    "roundId",
    "directionId",
    "librarySnapshotId",
    "outputDirectory",
    "managedFiles",
    "styleDigest",
    "status",
  ], "CustomFrontendManifestV2");
  invariant(manifest.schemaVersion === 2 && manifest.kind === "CustomFrontendManifestV2", "CustomFrontendManifestV2 identity is invalid.");
  portableId(manifest.projectId, "CustomFrontendManifestV2.projectId");
  validateAllowedKeys(manifest.profileRef, ["profileId", "revision"], "CustomFrontendManifestV2.profileRef");
  portableId(manifest.profileRef.profileId, "CustomFrontendManifestV2.profileRef.profileId");
  invariant(Number.isInteger(manifest.profileRef.revision) && manifest.profileRef.revision >= 1, "CustomFrontendManifestV2 profile revision is invalid.");
  portableId(manifest.roundId, "CustomFrontendManifestV2.roundId");
  portableId(manifest.directionId, "CustomFrontendManifestV2.directionId");
  snapshotRef(manifest.librarySnapshotId, "CustomFrontendManifestV2.librarySnapshotId");
  invariant(typeof manifest.outputDirectory === "string" && !path.isAbsolute(manifest.outputDirectory) && !manifest.outputDirectory.split(/[\\/]/).includes(".."), "CustomFrontendManifestV2 output directory is invalid.");
  invariant(JSON.stringify(manifest.managedFiles) === JSON.stringify(CUSTOMIZATION_MANAGED_FILES_V2), "CustomFrontendManifestV2 managed files changed.");
  invariant(/^[a-f0-9]{64}$/.test(manifest.styleDigest), "CustomFrontendManifestV2 style digest is invalid.");
  invariant(new Set(["candidate", "current"]).has(manifest.status), "CustomFrontendManifestV2 status is invalid.");
  return manifest;
}

function validateReceiptV2(receipt) {
  validateAllowedKeys(receipt, [
    "schemaVersion",
    "kind",
    "receiptId",
    "command",
    "status",
    "projectId",
    "profileRef",
    "roundId",
    "directionId",
    "action",
    "librarySnapshot",
    "style",
    "createdAt",
    "privacy",
  ], "CustomizationReceiptV2");
  invariant(receipt.schemaVersion === 2 && receipt.kind === "CustomizationReceiptV2", "CustomizationReceiptV2 identity is invalid.");
  portableId(receipt.receiptId, "CustomizationReceiptV2.receiptId");
  invariant(new Set(["prepare", "decide", "refresh"]).has(receipt.command), "CustomizationReceiptV2 command is invalid.");
  invariant(new Set(["succeeded", "attention", "blocked", "error"]).has(receipt.status), "CustomizationReceiptV2 status is invalid.");
  portableId(receipt.projectId, "CustomizationReceiptV2.projectId");
  validateAllowedKeys(receipt.profileRef, ["profileId", "revision"], "CustomizationReceiptV2.profileRef");
  if (receipt.roundId !== null) portableId(receipt.roundId, "CustomizationReceiptV2.roundId");
  if (receipt.directionId !== null) portableId(receipt.directionId, "CustomizationReceiptV2.directionId");
  if (receipt.action !== null) invariant(new Set(["keep", "adjust", "reject", "redo"]).has(receipt.action), "CustomizationReceiptV2 action is invalid.");
  validateAllowedKeys(receipt.librarySnapshot, ["before", "after"], "CustomizationReceiptV2.librarySnapshot");
  if (receipt.librarySnapshot.before !== null) snapshotRef(receipt.librarySnapshot.before, "CustomizationReceiptV2.librarySnapshot.before");
  if (receipt.librarySnapshot.after !== null) snapshotRef(receipt.librarySnapshot.after, "CustomizationReceiptV2.librarySnapshot.after");
  validateAllowedKeys(receipt.style, ["before", "after", "preserved"], "CustomizationReceiptV2.style");
  timestamp(receipt.createdAt, "CustomizationReceiptV2.createdAt");
  invariant(
    JSON.stringify(receipt.privacy) === JSON.stringify({
      rawInterviewStored: false,
      absolutePathsStored: false,
      privateProjectStateProjected: false,
    }),
    "CustomizationReceiptV2 privacy declaration changed.",
  );
  invariant(!PRIVATE_PATTERN.test(JSON.stringify(receipt)), "CustomizationReceiptV2 contains private path or secret-like evidence.");
  return receipt;
}

function generatedInputs(projectRoot) {
  const dist = resolveProjectPath(projectRoot, "dist", "generated reference output");
  invariant(fs.existsSync(dist), "dist is missing; run silent-orbit generate first.");
  const siteData = readJson(path.join(dist, SITE_DATA_FILE), `dist/${SITE_DATA_FILE}`);
  const handoff = validateFrontendHandoffV2(
    readJson(path.join(dist, FRONTEND_HANDOFF_FILE), `dist/${FRONTEND_HANDOFF_FILE}`),
    { siteData },
  );
  return { dist, siteData, handoff };
}

function typographyCss(direction) {
  if (direction.typography === "technical") {
    return {
      display: '"Atlas UI", Arial, sans-serif',
      reading: '"Atlas UI", Arial, sans-serif',
      tracking: "-.02em",
      transform: "uppercase",
    };
  }
  if (direction.typography === "humanist") {
    return {
      display: '"Atlas Reading", Georgia, serif',
      reading: '"Atlas Reading", Georgia, serif',
      tracking: "-.025em",
      transform: "none",
    };
  }
  return {
    display: '"Atlas Display", Georgia, serif',
    reading: '"Atlas Reading", Georgia, serif',
    tracking: "-.04em",
    transform: "none",
  };
}

function customizationCss(direction) {
  const typography = typographyCss(direction);
  const density = {
    airy: { header: "108px", row: "136px", gap: "32px", padding: "30px" },
    balanced: { header: "92px", row: "112px", gap: "22px", padding: "22px" },
    compact: { header: "76px", row: "88px", gap: "14px", padding: "16px" },
  }[direction.density];
  const radius = direction.shape === "soft" ? "18px" : "0px";
  const transition = { still: "0ms", measured: "160ms", expressive: "260ms" }[direction.motion];
  const expressive = direction.motion === "expressive"
    ? ".skill-row:hover { transform: translateY(-2px); } .map-node:hover { filter: drop-shadow(0 8px 10px color-mix(in srgb, var(--ink) 15%, transparent)); }"
    : "";
  const layout = direction.layout === "signal-grid"
    ? `
@media (min-width: 801px) {
  .topbar {
    grid-template-columns: minmax(210px, .7fr) auto minmax(260px, 1fr) auto;
    padding-inline: clamp(18px, 2vw, 30px);
    border: 1px solid var(--line-strong);
    border-top: 0;
  }
  .library-view {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    padding: var(--custom-gap);
    background: var(--line);
  }
  .filter-panel {
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--custom-gap);
    height: auto;
    overflow: visible;
    border: 1px solid var(--line-strong);
    background: var(--paper);
  }
  .filter-panel .panel-heading { margin-bottom: 0; }
  .filter-panel fieldset { margin: 0; }
  .list-panel {
    min-height: 0;
    height: auto;
    border: 1px solid var(--line-strong);
    background: var(--paper);
  }
  .skill-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    padding: 1px;
    background: var(--line);
  }
  .skill-row {
    min-height: calc(var(--custom-row-height) * 1.35);
    grid-template-columns: 1fr;
    align-content: space-between;
    border: 0;
    gap: var(--custom-gap);
  }
  .detail-panel {
    top: calc(var(--header-height) + 2vw);
    right: 2vw;
    bottom: 2vw;
    border: 1px solid var(--line-strong);
    border-radius: var(--custom-radius);
    box-shadow: 10px 10px 0 color-mix(in srgb, var(--ink) 16%, transparent);
    transform: translateX(calc(101% + 2vw));
  }
  .app-shell[data-detail-open="true"] .library-view { margin-right: 0; }
}
`
    : `
@media (min-width: 801px) {
  .filter-panel { border-right-color: var(--line-strong); }
  .skill-row { padding-inline: clamp(24px, 4vw, 68px); }
  .detail-panel { border-left-width: 2px; }
}
`;
  return `/* Generated from a reviewed DirectionV2. Data refresh must not edit this file. */
:root {
  --paper: ${direction.palette.paper};
  --ink: ${direction.palette.ink};
  --near-ink: color-mix(in srgb, var(--ink) 88%, var(--paper));
  --muted: ${direction.palette.muted};
  --line: ${direction.palette.line};
  --line-strong: ${direction.palette.ink};
  --accent: ${direction.palette.accent};
  --header-height: ${density.header};
  --custom-row-height: ${density.row};
  --custom-gap: ${density.gap};
  --custom-padding: ${density.padding};
  --custom-radius: ${radius};
  --custom-transition: ${transition};
  --custom-display: ${typography.display};
  --custom-reading: ${typography.reading};
}
html, body, .app-shell { background: var(--paper); color: var(--ink); }
body { font-family: var(--custom-reading); }
.identity strong,
.library-heading h1,
.detail-panel h1,
.chapter-title,
.focus-title,
.skill-copy strong {
  font-family: var(--custom-display);
  letter-spacing: ${typography.tracking};
  text-transform: ${typography.transform};
}
.skill-copy span,
.detail-description,
.map-skill-description { font-family: var(--custom-reading); }
button,
input,
.section-label,
.edition-label,
.skill-meta { font-family: "Atlas UI", Arial, sans-serif; }
.topbar,
.filter-panel,
.list-panel,
.detail-panel,
.map-stage,
.skill-row,
.search-control,
.view-switch button {
  border-radius: var(--custom-radius);
}
.skill-row {
  min-height: var(--custom-row-height);
  padding-block: var(--custom-padding);
  transition: color var(--custom-transition) ease, background var(--custom-transition) ease, transform var(--custom-transition) ease;
}
.detail-panel,
.library-view { transition-duration: var(--custom-transition); }
.map-node { transition: filter var(--custom-transition) ease, opacity var(--custom-transition) ease; }
${expressive}
${layout}
@media (max-width: 800px) {
  :root { --header-height: auto; }
  .topbar,
  .library-view,
  .map-view { border-radius: 0; }
  .skill-row { min-height: max(112px, var(--custom-row-height)); }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
}

function patchedIndex(source, direction) {
  invariant(source.includes("</head>") && source.includes("<body>"), "reference renderer index contract changed.");
  return source
    .replace("</head>", `    <link rel="stylesheet" href="./${STYLE_FILE}" />\n  </head>`)
    .replace("<body>", `<body data-custom-layout="${direction.layout}" data-custom-density="${direction.density}">`);
}

function directionPreview(direction) {
  return {
    schemaVersion: 2,
    kind: "DirectionPreviewV2",
    id: direction.id,
    label: direction.label,
    rationale: direction.rationale,
    layout: direction.layout,
    density: direction.density,
    typography: direction.typography,
    motion: direction.motion,
    shape: direction.shape,
    palette: direction.palette,
  };
}

function manifestFor({ projectId, profileRef, roundId, direction, handoff, outputDirectory, status, digest }) {
  return validateCustomFrontendManifestV2({
    schemaVersion: 2,
    kind: "CustomFrontendManifestV2",
    projectId,
    profileRef: { ...profileRef },
    roundId,
    directionId: direction.id,
    librarySnapshotId: handoff.binding.librarySnapshotId,
    outputDirectory: outputDirectory.split(path.sep).join("/"),
    managedFiles: [...CUSTOMIZATION_MANAGED_FILES_V2],
    styleDigest: digest,
    status,
  });
}

function materializeDirection({ projectRoot, target, projectId, profileRef, roundId, direction, siteData, handoff, outputDirectory }) {
  invariant(fs.existsSync(REFERENCE_TEMPLATE), "bundled reference renderer template is missing.");
  invariant(!fs.existsSync(target), "direction preview already exists.");
  retryTransientIo(() => fs.cpSync(REFERENCE_TEMPLATE, target, { recursive: true, errorOnExist: true, force: false }));
  try {
    atomicWriteText(path.join(target, "index.html"), patchedIndex(fs.readFileSync(path.join(target, "index.html"), "utf8"), direction));
    atomicWriteText(path.join(target, STYLE_FILE), customizationCss(direction));
    atomicWriteJson(path.join(target, DIRECTION_FILE), directionPreview(direction));
    atomicWriteJson(path.join(target, SITE_DATA_FILE), siteData);
    atomicWriteJson(path.join(target, FRONTEND_HANDOFF_FILE), handoff);
    const digest = styleDigest(target);
    const manifest = manifestFor({
      projectId,
      profileRef,
      roundId,
      direction,
      handoff,
      outputDirectory,
      status: "candidate",
      digest,
    });
    atomicWriteJson(path.join(target, MANIFEST_FILE), manifest);
    validatePublicOutput(target);
    invariant(styleDigest(target) === manifest.styleDigest, "candidate style digest changed during materialization.");
    return manifest;
  } catch (error) {
    removePath(target);
    throw error;
  }
}

function loadCustomization(projectRoot) {
  const profile = validateDesignProfileV2(readJson(resolveProjectPath(projectRoot, PROFILE_FILE, "design profile"), PROFILE_FILE));
  const state = validateCustomizationStateV2(readJson(resolveProjectPath(projectRoot, STATE_FILE, "customization state"), STATE_FILE));
  invariant(state.profileRef.profileId === profile.profileId && state.profileRef.revision === profile.revision, "customization profile and state are out of sync.");
  return { profile, state };
}

function writeReceipt(projectRoot, receipt) {
  validateReceiptV2(receipt);
  const target = resolveProjectPath(projectRoot, path.join(RECEIPTS_DIR, `${receipt.receiptId}.json`), "customization receipt");
  atomicWriteJson(target, receipt);
  return receipt;
}

function receiptFor({
  command,
  projectId,
  profileRef,
  roundId = null,
  directionId = null,
  action = null,
  beforeSnapshot = null,
  afterSnapshot = null,
  beforeStyle = null,
  afterStyle = null,
  stylePreserved = null,
  createdAt,
  status = "succeeded",
}) {
  const identity = sha256(stableJson({
    command,
    projectId,
    profileRef,
    roundId,
    directionId,
    action,
    beforeSnapshot,
    afterSnapshot,
    beforeStyle,
    afterStyle,
    stylePreserved,
    createdAt,
  })).slice(0, 16);
  return validateReceiptV2({
    schemaVersion: 2,
    kind: "CustomizationReceiptV2",
    receiptId: `customization-${command}-${identity}`,
    command,
    status,
    projectId,
    profileRef: { ...profileRef },
    roundId,
    directionId,
    action,
    librarySnapshot: { before: beforeSnapshot, after: afterSnapshot },
    style: { before: beforeStyle, after: afterStyle, preserved: stylePreserved },
    createdAt,
    privacy: {
      rawInterviewStored: false,
      absolutePathsStored: false,
      privateProjectStateProjected: false,
    },
  });
}

function initialRound({ profileRef, directions, createdAt }) {
  assertDirectionPair(directions);
  const material = directions.map((direction) => materialDirection(direction, { createdAt }));
  const id = `round-${sha256(stableJson({ profileRef, directions: material.map((direction) => direction.id), createdAt })).slice(0, 12)}`;
  return {
    id,
    createdAt,
    status: "open",
    inheritedFeedback: [],
    directions: material,
    decisions: [],
  };
}

function previewDirectory(roundId, directionId) {
  return path.join(ROUNDS_ROOT, roundId, directionId);
}

export function prepareSkillCosmosCustomizationV2({ projectDirectory = ".", request } = {}) {
  const projectRoot = resolveProjectRoot(projectDirectory);
  validateAllowedKeys(request, ["schemaVersion", "generatedAt", "profile", "directions"], "customize prepare request");
  invariant(request.schemaVersion === 2, "customize prepare request schemaVersion must be 2.");
  const createdAt = timestamp(request.generatedAt, "customize prepare request.generatedAt");
  const profile = validateDesignProfileV2(structuredClone(request.profile));
  assertDirectionPair(request.directions);
  const { siteData, handoff } = generatedInputs(projectRoot);
  invariant(siteData.project.projectId === handoff.projectId, "generated project binding is invalid.");
  invariant(!fs.existsSync(resolveProjectPath(projectRoot, STATE_FILE, "customization state")), "customization already exists; use decide adjust or redo to preserve history.");
  invariant(!fs.existsSync(resolveProjectPath(projectRoot, PROFILE_FILE, "design profile")), "design profile already exists without state; run customize doctor before continuing.");
  const profileRef = { profileId: profile.profileId, revision: profile.revision };
  const round = initialRound({ profileRef, directions: request.directions, createdAt });
  const state = validateCustomizationStateV2({
    schemaVersion: 2,
    kind: "CustomizationStateV2",
    projectId: handoff.projectId,
    profileRef,
    createdAt,
    updatedAt: createdAt,
    rounds: [round],
    current: null,
  });
  const roundTarget = resolveProjectPath(projectRoot, path.join(ROUNDS_ROOT, round.id), "customization round");
  const stagingRound = resolveProjectPath(projectRoot, path.join(OUTPUT_ROOT, `.prepare-${round.id}-${process.pid}`), "customization staging round");
  invariant(!fs.existsSync(roundTarget), "customization round output already exists.");
  if (fs.existsSync(stagingRound)) removePath(stagingRound);
  const previews = [];
  try {
    for (const direction of round.directions) {
      const relative = previewDirectory(round.id, direction.id);
      const stagedTarget = path.join(stagingRound, direction.id);
      const manifest = materializeDirection({
        projectRoot,
        target: stagedTarget,
        projectId: handoff.projectId,
        profileRef,
        roundId: round.id,
        direction,
        siteData,
        handoff,
        outputDirectory: relative,
      });
      previews.push({ id: direction.id, label: direction.label, previewDirectory: relative.split(path.sep).join("/"), styleDigest: manifest.styleDigest });
    }
    retryTransientIo(() => fs.mkdirSync(path.dirname(roundTarget), { recursive: true }));
    renamePath(stagingRound, roundTarget);
    atomicWriteJson(resolveProjectPath(projectRoot, PROFILE_FILE, "design profile"), profile);
    atomicWriteJson(resolveProjectPath(projectRoot, STATE_FILE, "customization state"), state);
  } catch (error) {
    if (fs.existsSync(stagingRound)) removePath(stagingRound);
    if (fs.existsSync(roundTarget)) removePath(roundTarget);
    throw error;
  }
  const receipt = writeReceipt(projectRoot, receiptFor({
    command: "prepare",
    projectId: handoff.projectId,
    profileRef,
    roundId: round.id,
    afterSnapshot: handoff.binding.librarySnapshotId,
    createdAt,
  }));
  return {
    schemaVersion: 2,
    kind: "CustomizationPrepareResultV2",
    status: "succeeded",
    projectId: handoff.projectId,
    profileRef,
    roundId: round.id,
    directions: previews,
    receipt,
  };
}

function openRound(state) {
  const round = [...state.rounds].reverse().find((candidate) => candidate.status === "open");
  invariant(round, "there is no open customization round.");
  return round;
}

function candidateDirection(round, directionId) {
  portableId(directionId, "decision directionId");
  const direction = round.directions.find((candidate) => candidate.id === directionId);
  invariant(direction, "decision direction does not exist in the open round.");
  invariant(direction.status === "candidate", "only an active candidate can be changed or selected.");
  return direction;
}

function decisionRecord({ action, directionId = null, feedback, createdAt, state }) {
  const id = `decision-${sha256(stableJson({ action, directionId, feedback, createdAt, count: state.rounds.reduce((sum, round) => sum + round.decisions.length, 0) })).slice(0, 12)}`;
  return { id, action, directionId, feedback, createdAt };
}

function promoteCurrent({ projectRoot, state, round, direction, handoff }) {
  const source = resolveProjectPath(projectRoot, previewDirectory(round.id, direction.id), "selected direction preview");
  validatePublicOutput(source);
  const sourceManifest = validateCustomFrontendManifestV2(readJson(path.join(source, MANIFEST_FILE), MANIFEST_FILE));
  invariant(sourceManifest.directionId === direction.id && sourceManifest.roundId === round.id, "selected preview manifest is stale.");
  invariant(styleDigest(source) === sourceManifest.styleDigest, "selected preview style digest is stale.");
  const staged = resolveProjectPath(projectRoot, path.join(OUTPUT_ROOT, `.current-${process.pid}`), "current frontend staging");
  if (fs.existsSync(staged)) removePath(staged);
  retryTransientIo(() => fs.cpSync(source, staged, { recursive: true, errorOnExist: true, force: false }));
  const currentManifest = validateCustomFrontendManifestV2({
    ...sourceManifest,
    librarySnapshotId: handoff.binding.librarySnapshotId,
    outputDirectory: "customization/current",
    status: "current",
  });
  atomicWriteJson(path.join(staged, MANIFEST_FILE), currentManifest);
  validatePublicOutput(staged);
  invariant(styleDigest(staged) === currentManifest.styleDigest, "selected current style digest changed during promotion.");
  replaceDirectory(projectRoot, staged, resolveProjectPath(projectRoot, CURRENT_ROOT, "current frontend"), `current-${direction.id}`);
  state.current = {
    roundId: round.id,
    directionId: direction.id,
    outputDirectory: "customization/current",
    styleDigest: currentManifest.styleDigest,
  };
  return currentManifest;
}

function updateProfileForRedo(existing, replacement, createdAt) {
  if (replacement === undefined) return existing;
  const next = validateDesignProfileV2(structuredClone(replacement));
  invariant(next.profileId === existing.profileId, "redo profile must retain the profile id.");
  invariant(next.revision === existing.revision + 1, "redo profile must advance exactly one revision.");
  invariant(next.createdAt === existing.createdAt, "redo profile must retain createdAt.");
  invariant(next.updatedAt === createdAt, "redo profile updatedAt must match the decision timestamp.");
  return next;
}

export function decideSkillCosmosCustomizationV2({ projectDirectory = ".", request } = {}) {
  const projectRoot = resolveProjectRoot(projectDirectory);
  validateAllowedKeys(request, ["schemaVersion", "generatedAt", "action", "directionId", "feedback", "direction", "directions", "profile"], "customize decide request");
  invariant(request.schemaVersion === 2, "customize decide request schemaVersion must be 2.");
  const createdAt = timestamp(request.generatedAt, "customize decide request.generatedAt");
  invariant(new Set(["keep", "adjust", "reject", "redo"]).has(request.action), "customize decide action is invalid.");
  const feedback = safeStrings(request.feedback ?? [], "customize decide request.feedback", 500);
  const { siteData, handoff } = generatedInputs(projectRoot);
  const loaded = loadCustomization(projectRoot);
  let profile = structuredClone(loaded.profile);
  const state = structuredClone(loaded.state);
  const round = openRound(state);
  let directionId = request.directionId ?? null;
  let createdPreview = null;
  let manifest = null;
  if (request.action === "reject") {
    const direction = candidateDirection(round, directionId);
    invariant(feedback.length > 0, "reject requires concise feedback.");
    direction.status = "rejected";
  } else if (request.action === "adjust") {
    const parent = candidateDirection(round, directionId);
    invariant(feedback.length > 0, "adjust requires concise feedback.");
    invariant(request.direction, "adjust requires a revised direction.");
    const revised = materialDirection(request.direction, {
      createdAt,
      revision: parent.revision + 1,
      parentDirectionId: parent.id,
    });
    invariant(!state.rounds.some((candidateRound) => candidateRound.directions.some((direction) => direction.id === revised.id)), "adjusted direction id already exists.");
    parent.status = "superseded";
    round.directions.push(revised);
    const active = round.directions.filter((direction) => direction.status === "candidate");
    invariant(active.length >= 1 && active.length <= 2, "adjust must leave one or two active directions.");
    if (active.length === 2) {
      const structuralDifferences = STRUCTURAL_DIRECTION_KEYS.filter((key) => active[0][key] !== active[1][key]);
      invariant(structuralDifferences.length >= 2, "adjusted direction must remain substantively different from the other candidate.");
    }
    const relative = previewDirectory(round.id, revised.id);
    const target = resolveProjectPath(projectRoot, relative, "adjusted direction preview");
    manifest = materializeDirection({
      projectRoot,
      target,
      projectId: state.projectId,
      profileRef: state.profileRef,
      roundId: round.id,
      direction: revised,
      siteData,
      handoff,
      outputDirectory: relative,
    });
    createdPreview = relative;
    directionId = revised.id;
  } else if (request.action === "redo") {
    invariant(feedback.length > 0, "redo requires concise inherited feedback.");
    assertDirectionPair(request.directions, "customize redo request.directions");
    profile = updateProfileForRedo(profile, request.profile, createdAt);
    state.profileRef = { profileId: profile.profileId, revision: profile.revision };
    round.status = "closed";
    for (const direction of round.directions) {
      if (direction.status === "candidate") direction.status = "superseded";
    }
    const nextRound = initialRound({ profileRef: state.profileRef, directions: request.directions, createdAt });
    nextRound.inheritedFeedback = [...feedback];
    invariant(!state.rounds.some((candidate) => candidate.id === nextRound.id), "redo round id already exists.");
    const roundTarget = resolveProjectPath(projectRoot, path.join(ROUNDS_ROOT, nextRound.id), "redo round");
    const stagingRound = resolveProjectPath(projectRoot, path.join(OUTPUT_ROOT, `.redo-${nextRound.id}-${process.pid}`), "redo staging");
    if (fs.existsSync(stagingRound)) removePath(stagingRound);
    try {
      for (const direction of nextRound.directions) {
        const relative = previewDirectory(nextRound.id, direction.id);
        materializeDirection({
          projectRoot,
          target: path.join(stagingRound, direction.id),
          projectId: state.projectId,
          profileRef: state.profileRef,
          roundId: nextRound.id,
          direction,
          siteData,
          handoff,
          outputDirectory: relative,
        });
      }
      retryTransientIo(() => fs.mkdirSync(path.dirname(roundTarget), { recursive: true }));
      renamePath(stagingRound, roundTarget);
    } catch (error) {
      if (fs.existsSync(stagingRound)) removePath(stagingRound);
      if (fs.existsSync(roundTarget)) removePath(roundTarget);
      throw error;
    }
    state.rounds.push(nextRound);
    directionId = null;
    createdPreview = path.join(ROUNDS_ROOT, nextRound.id);
  } else {
    const direction = candidateDirection(round, directionId);
    direction.status = "selected";
    for (const other of round.directions) {
      if (other.id !== direction.id && other.status === "candidate") other.status = "superseded";
    }
    round.status = "selected";
    manifest = promoteCurrent({ projectRoot, state, round, direction, handoff });
  }
  round.decisions.push(decisionRecord({
    action: request.action,
    directionId: request.action === "redo" ? null : request.directionId,
    feedback,
    createdAt,
    state,
  }));
  state.updatedAt = createdAt;
  validateDesignProfileV2(profile);
  validateCustomizationStateV2(state);
  atomicWriteJson(resolveProjectPath(projectRoot, PROFILE_FILE, "design profile"), profile);
  atomicWriteJson(resolveProjectPath(projectRoot, STATE_FILE, "customization state"), state);
  const receipt = writeReceipt(projectRoot, receiptFor({
    command: "decide",
    projectId: state.projectId,
    profileRef: state.profileRef,
    roundId: request.action === "redo" ? state.rounds.at(-1).id : round.id,
    directionId,
    action: request.action,
    afterSnapshot: handoff.binding.librarySnapshotId,
    afterStyle: manifest?.styleDigest ?? null,
    createdAt,
  }));
  return {
    schemaVersion: 2,
    kind: "CustomizationDecisionResultV2",
    status: "succeeded",
    projectId: state.projectId,
    profileRef: { ...state.profileRef },
    action: request.action,
    roundId: request.action === "redo" ? state.rounds.at(-1).id : round.id,
    directionId,
    previewDirectory: createdPreview ? createdPreview.split(path.sep).join("/") : null,
    current: state.current ? { ...state.current } : null,
    receipt,
  };
}

export function refreshSkillCosmosCustomizationV2({ projectDirectory = ".", generatedAt } = {}) {
  const projectRoot = resolveProjectRoot(projectDirectory);
  const createdAt = timestamp(generatedAt, "customize refresh generatedAt");
  const { siteData, handoff } = generatedInputs(projectRoot);
  const { state } = loadCustomization(projectRoot);
  invariant(state.current, "no direction has been kept; refresh has no current frontend.");
  const current = resolveProjectPath(projectRoot, CURRENT_ROOT, "current frontend");
  validatePublicOutput(current);
  const manifest = validateCustomFrontendManifestV2(readJson(path.join(current, MANIFEST_FILE), MANIFEST_FILE));
  invariant(manifest.status === "current", "current frontend manifest is not promoted.");
  invariant(manifest.directionId === state.current.directionId && manifest.roundId === state.current.roundId, "current frontend and private state disagree.");
  const beforeStyle = styleDigest(current);
  invariant(beforeStyle === manifest.styleDigest && beforeStyle === state.current.styleDigest, "current style digest is stale; refresh stopped without writing.");
  const staged = resolveProjectPath(projectRoot, path.join(OUTPUT_ROOT, `.refresh-${process.pid}`), "refresh staging");
  if (fs.existsSync(staged)) removePath(staged);
  retryTransientIo(() => fs.cpSync(current, staged, { recursive: true, errorOnExist: true, force: false }));
  try {
    atomicWriteJson(path.join(staged, SITE_DATA_FILE), siteData);
    atomicWriteJson(path.join(staged, FRONTEND_HANDOFF_FILE), handoff);
    const nextManifest = validateCustomFrontendManifestV2({
      ...manifest,
      librarySnapshotId: handoff.binding.librarySnapshotId,
    });
    atomicWriteJson(path.join(staged, MANIFEST_FILE), nextManifest);
    validatePublicOutput(staged);
    validateFrontendHandoffV2(readJson(path.join(staged, FRONTEND_HANDOFF_FILE), FRONTEND_HANDOFF_FILE), {
      siteData: readJson(path.join(staged, SITE_DATA_FILE), SITE_DATA_FILE),
    });
    const afterStyle = styleDigest(staged);
    invariant(afterStyle === beforeStyle, "refresh changed style-owned files; previous current frontend was preserved.");
    replaceDirectory(projectRoot, staged, current, `refresh-${state.current.directionId}`);
    const receipt = writeReceipt(projectRoot, receiptFor({
      command: "refresh",
      projectId: state.projectId,
      profileRef: state.profileRef,
      roundId: state.current.roundId,
      directionId: state.current.directionId,
      beforeSnapshot: manifest.librarySnapshotId,
      afterSnapshot: handoff.binding.librarySnapshotId,
      beforeStyle,
      afterStyle,
      stylePreserved: true,
      createdAt,
    }));
    return {
      schemaVersion: 2,
      kind: "CustomizationRefreshResultV2",
      status: "succeeded",
      projectId: state.projectId,
      beforeSnapshot: manifest.librarySnapshotId,
      afterSnapshot: handoff.binding.librarySnapshotId,
      styleDigest: afterStyle,
      stylePreserved: true,
      receipt,
    };
  } finally {
    if (fs.existsSync(staged)) removePath(staged);
  }
}

export function doctorSkillCosmosCustomizationV2({ projectDirectory = "." } = {}) {
  const projectRoot = resolveProjectRoot(projectDirectory);
  const checks = [];
  let inputs;
  try {
    inputs = generatedInputs(projectRoot);
    checks.push({ id: "frontend-handoff-v2", state: "pass", message: "Generated data and FrontendHandoffV2 are current." });
  } catch (error) {
    checks.push({ id: "frontend-handoff-v2", state: "error", message: error.message });
  }
  const profilePath = resolveProjectPath(projectRoot, PROFILE_FILE, "design profile");
  const statePath = resolveProjectPath(projectRoot, STATE_FILE, "customization state");
  if (!fs.existsSync(profilePath) && !fs.existsSync(statePath)) {
    checks.push({ id: "customization-state", state: "missing", message: "Customization has not been prepared." });
  } else {
    try {
      const { profile, state } = loadCustomization(projectRoot);
      checks.push({ id: "design-profile", state: "pass", message: `DesignProfileV2 revision ${profile.revision} is valid.` });
      checks.push({ id: "customization-state", state: "pass", message: `${state.rounds.length} customization round(s) preserve decision history.` });
      if (!state.current) {
        checks.push({ id: "current-frontend", state: "missing", message: "No direction has been kept yet." });
      } else {
        const current = resolveProjectPath(projectRoot, CURRENT_ROOT, "current frontend");
        validatePublicOutput(current);
        const manifest = validateCustomFrontendManifestV2(readJson(path.join(current, MANIFEST_FILE), MANIFEST_FILE));
        const digest = styleDigest(current);
        invariant(digest === manifest.styleDigest && digest === state.current.styleDigest, "current frontend style digest is stale.");
        if (inputs) {
          const currentHandoff = validateFrontendHandoffV2(readJson(path.join(current, FRONTEND_HANDOFF_FILE), FRONTEND_HANDOFF_FILE), {
            siteData: readJson(path.join(current, SITE_DATA_FILE), SITE_DATA_FILE),
          });
          const snapshotState = currentHandoff.binding.librarySnapshotId === inputs.handoff.binding.librarySnapshotId ? "pass" : "attention";
          checks.push({
            id: "refresh-binding",
            state: snapshotState,
            message: snapshotState === "pass" ? "Current frontend is bound to the latest Library Snapshot." : "Current frontend needs customize refresh.",
          });
        }
        checks.push({ id: "current-frontend", state: "pass", message: "Current frontend manifest and style digest are valid." });
      }
    } catch (error) {
      checks.push({ id: "customization-state", state: "error", message: error.message });
    }
  }
  const status = checks.some((check) => check.state === "error")
    ? "error"
    : checks.some((check) => ["missing", "attention"].includes(check.state))
      ? "attention"
      : "ok";
  return { schemaVersion: 2, kind: "CustomizationDoctorV2", status, checks };
}

export function statusSkillCosmosCustomizationV2({ projectDirectory = "." } = {}) {
  const projectRoot = resolveProjectRoot(projectDirectory);
  const profilePath = resolveProjectPath(projectRoot, PROFILE_FILE, "design profile");
  const statePath = resolveProjectPath(projectRoot, STATE_FILE, "customization state");
  if (!fs.existsSync(profilePath) && !fs.existsSync(statePath)) {
    return {
      schemaVersion: 2,
      kind: "CustomizationStatusV2",
      status: "not-prepared",
      profileRef: null,
      rounds: 0,
      openRoundId: null,
      activeDirections: [],
      current: null,
    };
  }
  const { state } = loadCustomization(projectRoot);
  const activeRound = [...state.rounds].reverse().find((round) => round.status === "open");
  return {
    schemaVersion: 2,
    kind: "CustomizationStatusV2",
    status: state.current ? "current" : "in-review",
    profileRef: { ...state.profileRef },
    rounds: state.rounds.length,
    openRoundId: activeRound?.id ?? null,
    activeDirections: activeRound
      ? activeRound.directions.filter((direction) => direction.status === "candidate").map((direction) => ({
        id: direction.id,
        label: direction.label,
        revision: direction.revision,
        previewDirectory: previewDirectory(activeRound.id, direction.id).split(path.sep).join("/"),
      }))
      : [],
    current: state.current ? { ...state.current } : null,
  };
}

export const skillCosmosCustomizationFiles = Object.freeze({
  profile: PROFILE_FILE,
  state: STATE_FILE,
  receipts: RECEIPTS_DIR,
  rounds: ROUNDS_ROOT,
  current: CURRENT_ROOT,
  manifest: MANIFEST_FILE,
});
