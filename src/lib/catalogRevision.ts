import type { SkillRecord } from "../types";

export function catalogRevision(skill: SkillRecord): string {
  const visibleFields = JSON.stringify([
    skill.name,
    skill.description,
    skill.trigger,
    skill.category,
    skill.library_key,
    skill.status ?? "",
    skill.repo_url ?? "",
  ]);
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(visibleFields)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
