import { appData } from "../generated/data.generated";
import type { CategoryGroup, CategoryUnit, LibraryRecord, SkillRecord } from "../types";
import {
  createLibraryKeyIndex,
  createSkillNameIndex,
  findCategoryByName,
  isHighValueSkillRecord,
  isHighValueUnitRecord,
  listSourceKinds,
  resolveLibraryForUnit,
  resolveSkillsForUnit,
} from "../lib/dataSelectors";
import { rankSkillRecords } from "../lib/skillSearch";

export const skills = [...appData.skills];
export const libraries = [...appData.libraries];
export const categoryGroups = [...appData.categoryUnits];
export const personalSkills = [...appData.personalSkills];
export const changes = [...appData.changes];
export const skillDetails = [...appData.skillDetails];
export const maintenanceStatus = appData.maintenanceStatus;

export const skillsByName = createSkillNameIndex(skills);
export const librariesByKey = createLibraryKeyIndex(libraries);
export const skillDetailsByName = new Map(skillDetails.map((detail) => [detail.skill, detail]));

export function getLibraryForUnit(unit: CategoryUnit): LibraryRecord | undefined {
  return resolveLibraryForUnit(unit, libraries);
}

export function getSkillsForUnit(unit: CategoryUnit): SkillRecord[] {
  return resolveSkillsForUnit(unit, skillsByName);
}

export function isHighValueSkill(skill: SkillRecord): boolean {
  return isHighValueSkillRecord(skill);
}

export function isHighValueUnit(unit: CategoryUnit): boolean {
  return isHighValueUnitRecord(unit, libraries, skillsByName);
}

export function getCategoryByName(categoryName: string): CategoryGroup | undefined {
  return findCategoryByName(categoryGroups, categoryName);
}

export function rankSkills(text: string, category: string, sourceKind: string, starredOnly: boolean) {
  return rankSkillRecords(skills, librariesByKey, { text, category, sourceKind, starredOnly });
}

export function searchSkills(text: string, category: string, sourceKind: string, starredOnly: boolean) {
  return rankSkills(text, category, sourceKind, starredOnly).map((result) => result.skill);
}

export const sourceKinds = listSourceKinds(libraries);

export const taskGoals = [
  {
    label: "截图 / 页面验证",
    hint: "截图、浏览器检查、页面证据",
    category: "浏览器与自动化",
    query: "screenshot",
  },
  {
    label: "做设计审查",
    hint: "网页体验、设计规范、可读性检查",
    category: "设计与创意生产",
    query: "web-design-guidelines",
  },
  {
    label: "整理 Obsidian 知识库",
    hint: "笔记、Vault、Markdown、Bases",
    category: "个人知识库与本地工具",
    query: "obsidian",
  },
  {
    label: "维护 skills / 找技能",
    hint: "安装、分类、触发词、说明书",
    category: "效率与元工作流",
    query: "skill",
  },
  {
    label: "做 HTML 交付物",
    hint: "HTML 页面、图示、计划页、演示稿",
    category: "文档与办公",
    query: "html",
  },
  {
    label: "写作润色 / 中文化",
    hint: "humanizer、中文口吻、文档整理",
    category: "写作与中文润色",
    query: "humanizer",
  },
];
