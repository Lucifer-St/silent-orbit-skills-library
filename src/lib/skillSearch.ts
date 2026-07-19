import type { LibraryRecord, RankedSkillResult, SkillRecord, SkillSearchQuery } from "../types";
import { isHighValueSkillRecord } from "./dataSelectors";
import { categoryEnglish } from "../i18n/LocaleContext";

const NOISE_PHRASES = ["帮我找", "帮我", "找一下", "查一下", "我想", "想要", "需要", "可以", "请问", "如何", "一个", "进行"];
const AI_NEWS_EQUIVALENTS = ["新闻", "消息", "资讯"] as const;
const CURATED_INTENTS = [
  {
    signals: ["ui", "界面", "网页", "网站", "审美", "交互", "体验", "设计审查", "视觉检查"],
    boosts: new Map([
      ["audit", 180],
      ["frontend-testing-debugging", 170],
      ["web-design-guidelines", 160],
      ["frontend-app-builder", 80],
    ]),
  },
] as const;

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，。！？、：；（）【】“”‘’,.!?:;()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueryTokenGroups(value: string): readonly (readonly string[])[] {
  const normalized = normalizeSearchText(value);
  const tokens = tokenizeSearchText(value);
  const hasAiContext = tokens.includes("ai") || normalized.includes("人工智能");
  const seen = new Set<string>();
  const groups: string[][] = [];

  for (const token of tokens) {
    const alternatives = hasAiContext && AI_NEWS_EQUIVALENTS.includes(token as (typeof AI_NEWS_EQUIVALENTS)[number])
      ? [...AI_NEWS_EQUIVALENTS]
      : [token];
    const key = alternatives.join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(alternatives);
  }

  return groups;
}

export function tokenizeSearchText(value: string) {
  const normalized = normalizeSearchText(value);
  const searchable = NOISE_PHRASES.reduce((text, phrase) => text.split(phrase).join(" "), normalized).replace(/\s+/g, " ").trim();
  if (!searchable) return [];
  const tokens = searchable.match(/[a-z0-9][a-z0-9+_.-]*|[\u3400-\u9fff]{2,}/g) ?? [];
  return tokens.flatMap((token) => {
    if (!/[\u3400-\u9fff]/.test(token)) return [token];
    const parts = [];
    for (let index = 0; index < token.length - 1; index += 1) parts.push(token.slice(index, index + 2));
    return parts.length > 0 ? parts : [token];
  });
}

export function rankSkillRecords(
  skills: readonly SkillRecord[],
  librariesByKey: ReadonlyMap<string, LibraryRecord>,
  query: SkillSearchQuery,
): RankedSkillResult[] {
  const phrase = normalizeSearchText(query.text);
  const tokenGroups = buildQueryTokenGroups(query.text);
  if (!phrase || tokenGroups.length === 0) return [];
  return skills.flatMap((skill) => {
    const library = librariesByKey.get(skill.library_key);
    if (query.category !== "all" && skill.category !== query.category) return [];
    if (query.sourceKind !== "all" && library?.kind !== query.sourceKind) return [];
    if (query.starredOnly && !isHighValueSkillRecord(skill)) return [];
    const fields = [
      [skill.name, 12], [skill.trigger, 12], [skill.description, 6],
      [skill.description_i18n?.["en-US"], 6], [skill.description_i18n?.["zh-CN"], 6],
      [skill.category, 3], [categoryEnglish.get(skill.category), 3],
      [skill.library_title, 2], [library?.source_label, 1], [skill.repo, 1],
      [skill.origin, 1], [skill.visibility, 1],
    ] as const;
    let score = curatedIntentBoost(phrase, skill.name);
    for (const [raw, weight] of fields) {
      const text = normalizeSearchText(raw ?? "");
      if (!text) continue;
      if (text.includes(phrase)) score += weight * 3;
      for (const group of tokenGroups) if (group.some((token) => text.includes(token))) score += weight;
      if (tokenGroups.every((group) => group.some((token) => text.includes(token)))) score += weight * tokenGroups.length;
    }
    return score > 0 ? [{ skill, score }] : [];
  }).sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name, "zh-CN"));
}

function curatedIntentBoost(query: string, skillName: string) {
  let score = 0;
  for (const intent of CURATED_INTENTS) {
    const matchedSignals = intent.signals.filter((signal) => query.includes(signal)).length;
    if (matchedSignals < 2) continue;
    score += (intent.boosts.get(skillName) ?? 0) + matchedSignals * 2;
  }
  return score;
}
