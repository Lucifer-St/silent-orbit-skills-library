import type { RankedSkillResult, SkillRecord } from "../../types";
import { librariesByKey } from "../../data/indexes";
import { useLocale } from "../../i18n/LocaleContext";

export interface RankedSkillCardProps {
  order: number;
  result: RankedSkillResult;
  onOpen: (skill: SkillRecord) => void;
}

function hashSkillName(name: string) {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildConstellation(name: string) {
  const hash = hashSkillName(name);
  let state = hash || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const points = Array.from({ length: 6 }, (_, index) => ({
    x: Math.round((9 + index * 20 + next() * 7) * 10) / 10,
    y: Math.round((7 + next() * 33) * 10) / 10,
  }));
  return {
    signature: hash.toString(16).padStart(8, "0"),
    points,
    path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
  };
}

export function RankedSkillCard({ order, result, onOpen }: RankedSkillCardProps) {
  const { category, libraryTitle, skillDescription, text } = useLocale();
  const { skill } = result;
  const description = skillDescription(skill);
  const library = librariesByKey.get(skill.library_key);
  const constellation = buildConstellation(skill.name);
  return (
    <button
      className="ranked-skill-card"
      type="button"
      aria-label={text(`打开 ${skill.name} Skill 详情`, `Open ${skill.name} Skill detail`)}
      onClick={() => onOpen(skill)}
    >
      <span className="ranked-order">{String(order).padStart(2, "0")}</span>
      <svg
        className="ranked-skill-constellation"
        viewBox="0 0 120 48"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        data-skill-signature={constellation.signature}
      >
        <path d={constellation.path} />
        {constellation.points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={index === 0 || index === constellation.points.length - 1 ? 1.5 : 1} />
        ))}
      </svg>
      <strong>{skill.name}</strong>
      <span className="ranked-description" title={description}>
        {description}
      </span>
      <span className="ranked-meta">
        <span>{category(skill.category)}</span>
        <span>{libraryTitle(library, skill.library_title)}</span>
      </span>
    </button>
  );
}
