import type { PersonalDataV1, SkillOutcome, SkillOutcomeTombstone } from "../types";
import {
  emptyPersonalData,
  MAX_OUTCOMES_PER_SKILL,
  MAX_OUTCOMES_TOTAL,
  OUTCOME_COOLDOWN_MS,
} from "./outcomePolicy";

const DATA_KEY = "personal-agent-os.personal-data.v1";
const BACKUP_KEY = "personal-agent-os.personal-data.invalid-backup";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersonalStore {
  load(): PersonalDataV1;
  replace(data: PersonalDataV1): void;
  importJson(raw: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && record[key].trim().length > 0;
}

function isCanonicalIsoUtc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isOutcome(value: unknown): value is SkillOutcome {
  if (!isRecord(value)) return false;
  return (
    hasNonEmptyString(value, "id") &&
    hasNonEmptyString(value, "skillId") &&
    hasNonEmptyString(value, "title") &&
    isCanonicalIsoUtc(value.completedAt) &&
    (value.note === undefined || typeof value.note === "string") &&
    (value.artifactRef === undefined || typeof value.artifactRef === "string") &&
    hasNonEmptyString(value, "catalogRevision") &&
    (value.pinned === undefined || typeof value.pinned === "boolean")
  );
}

function isTombstone(value: unknown): value is SkillOutcomeTombstone {
  if (!isRecord(value)) return false;
  if (
    !hasNonEmptyString(value, "skillId") ||
    !isCanonicalIsoUtc(value.deletedAt) ||
    !isCanonicalIsoUtc(value.unlockAt) ||
    !hasNonEmptyString(value, "deletedCatalogRevision")
  ) return false;
  return Date.parse(value.unlockAt) === Date.parse(value.deletedAt) + OUTCOME_COOLDOWN_MS;
}

function preservesDomainInvariants(
  outcomes: readonly SkillOutcome[],
  tombstones: readonly SkillOutcomeTombstone[],
): boolean {
  if (outcomes.length > MAX_OUTCOMES_TOTAL) return false;

  const outcomeIds = new Set<string>();
  const outcomesPerSkill = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcomeIds.has(outcome.id)) return false;
    outcomeIds.add(outcome.id);
    const count = (outcomesPerSkill.get(outcome.skillId) ?? 0) + 1;
    if (count > MAX_OUTCOMES_PER_SKILL) return false;
    outcomesPerSkill.set(outcome.skillId, count);
  }

  const tombstoneSkills = new Set<string>();
  for (const tombstone of tombstones) {
    if (tombstoneSkills.has(tombstone.skillId)) return false;
    tombstoneSkills.add(tombstone.skillId);
  }
  return true;
}

function validatePersonalData(value: unknown): PersonalDataV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported personal data schema");
  }
  if (
    !Array.isArray(value.outcomes) ||
    !value.outcomes.every(isOutcome) ||
    !Array.isArray(value.tombstones) ||
    !value.tombstones.every(isTombstone) ||
    !preservesDomainInvariants(value.outcomes, value.tombstones)
  ) {
    throw new Error("Invalid personal data");
  }
  return value as unknown as PersonalDataV1;
}

function parsePersonalData(raw: string): PersonalDataV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid personal data JSON");
  }
  return validatePersonalData(parsed);
}

export function createPersonalStore(storage: StorageLike): PersonalStore {
  return {
    load() {
      const raw = storage.getItem(DATA_KEY);
      if (raw === null) return emptyPersonalData();
      try {
        return parsePersonalData(raw);
      } catch {
        try {
          storage.setItem(BACKUP_KEY, raw);
        } catch {
          // Recovery must still succeed when local backup storage is unavailable.
        }
        return emptyPersonalData();
      }
    },
    replace(data) {
      const validated = validatePersonalData(data);
      storage.setItem(DATA_KEY, JSON.stringify(validated));
    },
    importJson(raw) {
      const validated = parsePersonalData(raw);
      storage.setItem(DATA_KEY, JSON.stringify(validated));
    },
  };
}
