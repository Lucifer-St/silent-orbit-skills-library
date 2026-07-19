import type { CategoryGroup, CategoryUnit, LibraryRecord, SkillRecord } from "../types";
import { categoryEnglish } from "../i18n/LocaleContext";

export function createSkillNameIndex(skills: readonly SkillRecord[]) {
  return new Map<string, SkillRecord>(skills.map((skill) => [skill.name, skill]));
}

export function createLibraryKeyIndex(libraries: readonly LibraryRecord[]) {
  return new Map<string, LibraryRecord>(libraries.map((library) => [library.key, library]));
}

export function resolveLibraryForUnit(
  unit: CategoryUnit,
  libraries: readonly LibraryRecord[],
): LibraryRecord | undefined {
  return libraries.find((library) => {
    if (unit.page && library.page === unit.page) return true;
    if (library.skills.length === unit.skills.length && unit.skills.every((name) => library.skills.includes(name))) {
      return true;
    }
    if (library.title === unit.title) return true;
    return false;
  });
}

export function getCanonicalUnitIdentity(
  categoryName: string,
  unit: CategoryUnit,
  resolvedLibrary?: Pick<LibraryRecord, "key">,
): string {
  if (resolvedLibrary) return `library:${resolvedLibrary.key}`;
  if (unit.type === "skill" && unit.skills.length === 1) return `skill:${unit.skills[0]}`;
  if (unit.page) return `page:${unit.page}`;
  return `unit:${categoryName}:${[...unit.skills].sort().join(",")}`;
}

export function getCanonicalStationId(
  categoryName: string,
  unit: CategoryUnit,
  resolvedLibrary?: Pick<LibraryRecord, "key">,
): string {
  return getStationIdForUnitIdentity(getCanonicalUnitIdentity(categoryName, unit, resolvedLibrary));
}

export function getStationIdForUnitIdentity(unitIdentity: string): string {
  return `station:${unitIdentity}`;
}

export function resolveSkillsForUnit(
  unit: CategoryUnit,
  skillIndex: ReadonlyMap<string, SkillRecord>,
): SkillRecord[] {
  return unit.skills.map((name) => skillIndex.get(name)).filter((skill): skill is SkillRecord => Boolean(skill));
}

export function isHighValueSkillRecord(skill: SkillRecord): boolean {
  return (
    (skill.star_tier !== undefined && skill.star_tier !== "none") ||
    (skill.frequency ?? 0) >= 5 ||
    (skill.importance ?? 0) >= 5
  );
}

export function isHighValueUnitRecord(
  unit: CategoryUnit,
  libraries: readonly LibraryRecord[],
  skillIndex: ReadonlyMap<string, SkillRecord>,
): boolean {
  const library = resolveLibraryForUnit(unit, libraries);
  if ((library?.starred_count ?? 0) > 0 || (library?.high_value_count ?? 0) > 0) return true;
  return resolveSkillsForUnit(unit, skillIndex).some(isHighValueSkillRecord);
}

export function findCategoryByName(
  categories: readonly CategoryGroup[],
  categoryName: string,
): CategoryGroup | undefined {
  return categories.find((category) => category.category === categoryName);
}

export function filterSkills(
  skills: readonly SkillRecord[],
  librariesByKey: ReadonlyMap<string, LibraryRecord>,
  query: string,
  categoryName: string,
  sourceKind: string,
  starredOnly: boolean,
): SkillRecord[] {
  const normalized = query.trim().toLowerCase();
  return skills.filter((skill) => {
    const library = librariesByKey.get(skill.library_key);
    const text = [
      skill.name,
      skill.description,
      skill.description_i18n?.["en-US"],
      skill.description_i18n?.["zh-CN"],
      skill.trigger,
      skill.category,
      categoryEnglish.get(skill.category),
      skill.library_title,
      skill.repo,
      skill.origin,
      skill.visibility,
      library?.source_label,
      library?.kind_label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (normalized && !text.includes(normalized)) return false;
    if (categoryName !== "all" && skill.category !== categoryName) return false;
    if (sourceKind !== "all" && library?.kind !== sourceKind) return false;
    if (starredOnly && !isHighValueSkillRecord(skill)) return false;
    return true;
  });
}

export function filterCategorySkills(
  skills: readonly SkillRecord[],
  librariesByKey: ReadonlyMap<string, LibraryRecord>,
  category: CategoryGroup,
  query: string,
  sourceKind: string,
  starredOnly: boolean,
): SkillRecord[] {
  const unitSkillNames = new Set(category.units.flatMap((unit) => unit.skills));
  return filterSkills(skills, librariesByKey, query, "all", sourceKind, starredOnly)
    .filter((skill) => unitSkillNames.has(skill.name) || skill.category === category.category);
}

export function listSourceKinds(libraries: readonly LibraryRecord[]) {
  return Array.from(new Set(libraries.map((library) => library.kind))).sort();
}
