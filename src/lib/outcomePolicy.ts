import type { PersonalDataV1, SkillOutcome, SkillOutcomeTombstone } from "../types";

export const OUTCOME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_OUTCOMES_PER_SKILL = 3;
export const MAX_OUTCOMES_TOTAL = 200;

export interface OutcomeDraft {
  readonly skillId: string;
  readonly title: string;
  readonly note?: string;
  readonly artifactRef?: string;
  readonly catalogRevision: string;
  readonly pinned?: boolean;
}

export interface OutcomeUpdateDraft {
  readonly title: string;
  readonly note?: string;
  readonly artifactRef?: string;
  readonly catalogRevision: string;
}

export type OutcomePermission =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "cooldown" | "tombstone" | "capacity"; readonly unlockAt?: string };

export type TryRecordOutcomeResult =
  | { readonly allowed: true; readonly data: PersonalDataV1 }
  | Extract<OutcomePermission, { readonly allowed: false }>;

export interface DeleteOutcomeResult {
  readonly data: PersonalDataV1;
}

export function emptyPersonalData(): PersonalDataV1 {
  return { schemaVersion: 1, outcomes: [], tombstones: [] };
}

export function currentPeriodOutcome(
  data: PersonalDataV1,
  skillId: string,
  now: Date,
): SkillOutcome | undefined {
  const nowTime = now.getTime();
  return data.outcomes
    .filter((outcome) => {
      if (outcome.skillId !== skillId) return false;
      const completedAt = Date.parse(outcome.completedAt);
      const age = nowTime - completedAt;
      return Number.isFinite(completedAt) && age >= 0 && age < OUTCOME_COOLDOWN_MS;
    })
    .sort(compareOutcomesNewestFirst)[0];
}

function createOutcomeId(data: PersonalDataV1, skillId: string, completedAt: string): string {
  const base = `${skillId}:${completedAt}`;
  const ids = new Set(data.outcomes.map((outcome) => outcome.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}:${suffix}`)) suffix += 1;
  return `${base}:${suffix}`;
}

function compareOutcomesNewestFirst(left: SkillOutcome, right: SkillOutcome): number {
  const leftTime = Date.parse(left.completedAt);
  const rightTime = Date.parse(right.completedAt);
  if (leftTime !== rightTime) {
    if (!Number.isFinite(leftTime)) return 1;
    if (!Number.isFinite(rightTime)) return -1;
    return rightTime - leftTime;
  }
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function requireNonEmptyDraftField(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

export function recordOutcome(data: PersonalDataV1, draft: OutcomeDraft, now: Date): PersonalDataV1 {
  requireNonEmptyDraftField("skillId", draft.skillId);
  requireNonEmptyDraftField("title", draft.title);
  requireNonEmptyDraftField("catalogRevision", draft.catalogRevision);
  const completedAt = now.toISOString();
  const outcome: SkillOutcome = {
    id: createOutcomeId(data, draft.skillId, completedAt),
    skillId: draft.skillId,
    title: draft.title,
    completedAt,
    ...(draft.note === undefined ? {} : { note: draft.note }),
    ...(draft.artifactRef === undefined ? {} : { artifactRef: draft.artifactRef }),
    catalogRevision: draft.catalogRevision,
    ...(draft.pinned === undefined ? {} : { pinned: draft.pinned }),
  };

  const perSkillCounts = new Map<string, number>();
  const outcomes = [outcome, ...data.outcomes]
    .sort(compareOutcomesNewestFirst)
    .filter((candidate) => {
      const count = (perSkillCounts.get(candidate.skillId) ?? 0) + 1;
      perSkillCounts.set(candidate.skillId, count);
      return count <= MAX_OUTCOMES_PER_SKILL;
    });

  return {
    schemaVersion: 1,
    outcomes: outcomes.slice(0, MAX_OUTCOMES_TOTAL),
    tombstones: data.tombstones,
  };
}

export function updateOutcome(
  data: PersonalDataV1,
  outcomeId: string,
  draft: OutcomeUpdateDraft,
): PersonalDataV1 {
  requireNonEmptyDraftField("title", draft.title);
  requireNonEmptyDraftField("catalogRevision", draft.catalogRevision);

  const existing = data.outcomes.find((outcome) => outcome.id === outcomeId);
  if (!existing) throw new Error(`Outcome not found: ${outcomeId}`);

  const updated: SkillOutcome = {
    id: existing.id,
    skillId: existing.skillId,
    title: draft.title,
    completedAt: existing.completedAt,
    ...(draft.note === undefined ? {} : { note: draft.note }),
    ...(draft.artifactRef === undefined ? {} : { artifactRef: draft.artifactRef }),
    catalogRevision: draft.catalogRevision,
    ...(existing.pinned === undefined ? {} : { pinned: existing.pinned }),
  };

  return {
    schemaVersion: 1,
    outcomes: data.outcomes.map((outcome) => (outcome.id === outcomeId ? updated : outcome)),
    tombstones: data.tombstones,
  };
}

export function deleteOutcome(data: PersonalDataV1, outcomeId: string, now: Date): DeleteOutcomeResult {
  const deleted = data.outcomes.find((outcome) => outcome.id === outcomeId);
  if (!deleted) return { data };

  const deletedAt = now.toISOString();
  const tombstone: SkillOutcomeTombstone = {
    skillId: deleted.skillId,
    deletedAt,
    unlockAt: new Date(now.getTime() + OUTCOME_COOLDOWN_MS).toISOString(),
    deletedCatalogRevision: deleted.catalogRevision,
  };
  return {
    data: {
      schemaVersion: 1,
      outcomes: data.outcomes.filter((outcome) => outcome.id !== outcomeId),
      tombstones: [tombstone, ...data.tombstones.filter((item) => item.skillId !== deleted.skillId)],
    },
  };
}

export function unlockSkill(data: PersonalDataV1, skillId: string): PersonalDataV1 {
  return {
    schemaVersion: 1,
    outcomes: data.outcomes,
    tombstones: data.tombstones.filter((tombstone) => tombstone.skillId !== skillId),
  };
}

export function canCreateOutcome(
  data: PersonalDataV1,
  skillId: string,
  currentCatalogRevision: string,
  now: Date,
): OutcomePermission {
  const latestCompletedAt = data.outcomes
    .filter((outcome) => outcome.skillId === skillId)
    .reduce((latest, outcome) => {
      const completedAt = Date.parse(outcome.completedAt);
      return Number.isFinite(completedAt) ? Math.max(latest, completedAt) : latest;
    }, Number.NEGATIVE_INFINITY);
  const cooldownUnlockAt = latestCompletedAt + OUTCOME_COOLDOWN_MS;
  if (Number.isFinite(cooldownUnlockAt) && now.getTime() < cooldownUnlockAt) {
    return { allowed: false, reason: "cooldown", unlockAt: new Date(cooldownUnlockAt).toISOString() };
  }

  const latestTombstoneUnlock = data.tombstones.reduce((latest, tombstone) => {
    if (tombstone.skillId !== skillId || tombstone.deletedCatalogRevision !== currentCatalogRevision) return latest;
    const unlockAt = Date.parse(tombstone.unlockAt);
    return Number.isFinite(unlockAt) && now.getTime() < unlockAt ? Math.max(latest, unlockAt) : latest;
  }, Number.NEGATIVE_INFINITY);
  if (Number.isFinite(latestTombstoneUnlock)) {
    return { allowed: false, reason: "tombstone", unlockAt: new Date(latestTombstoneUnlock).toISOString() };
  }

  if (data.outcomes.length >= MAX_OUTCOMES_TOTAL) return { allowed: false, reason: "capacity" };
  return { allowed: true };
}

export function tryRecordOutcome(
  data: PersonalDataV1,
  draft: OutcomeDraft,
  now: Date,
): TryRecordOutcomeResult {
  const permission = canCreateOutcome(data, draft.skillId, draft.catalogRevision, now);
  if (!permission.allowed) return permission;
  return { allowed: true, data: recordOutcome(data, draft, now) };
}
