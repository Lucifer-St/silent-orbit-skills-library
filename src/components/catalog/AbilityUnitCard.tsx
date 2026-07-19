import { ExternalLink } from "lucide-react";
import { getLibraryForUnit, isHighValueUnit } from "../../data/indexes";
import type { CategoryUnit, SkillRecord } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";
import { SkillList } from "./SkillList";

export interface AbilityUnitCardProps {
  unit: CategoryUnit;
  unitId: string;
  skills: readonly SkillRecord[];
  expanded: boolean;
  onToggle: () => void;
  onSkill: (skill: SkillRecord) => void;
}

export function AbilityUnitCard({ unit, unitId, skills, expanded, onToggle, onSkill }: AbilityUnitCardProps) {
  const { libraryDescription, libraryTitle, metadataLabel, skillDescription, text } = useLocale();
  const library = getLibraryForUnit(unit);
  const unitSkills = skills;
  const highValue = isHighValueUnit(unit);

  return (
    <article className={`unit-card ${highValue ? "priority" : ""}`} data-unit-id={unitId}>
      <button className="unit-card-main" type="button" aria-expanded={expanded} onClick={onToggle}>
        <span className="unit-kind">{metadataLabel(unit.kind ?? unit.type)}</span>
        <strong>{libraryTitle(library, unit.title)}</strong>
        <p>{libraryDescription(library, describeUnit(unit, unitSkills, skillDescription, text))}</p>
        <div className="unit-meta">
          <span>{unitSkills.length} skills</span>
          <span>{metadataLabel(library?.source_label ?? unit.type)}</span>
          {highValue ? <span className="priority-chip">PRIORITY</span> : null}
        </div>
      </button>

      {expanded ? (
        <div className="unit-expanded">
          <SkillList skills={unitSkills} onSkill={onSkill} compact />
          {library?.source_url ? (
            <a className="source-link" href={library.source_url} target="_blank" rel="noreferrer">
              {text("查看来源", "VIEW SOURCE")}
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function describeUnit(
  unit: CategoryUnit,
  unitSkills: readonly SkillRecord[],
  skillDescription: (skill: SkillRecord) => string,
  text: (zh: string, en: string) => string,
) {
  if (unit.type === "skill" && unitSkills[0]) return skillDescription(unitSkills[0]);
  return text(
    `包含 ${unit.skill_count} 个相关 Skills，适合按共同目标作为一个能力单元使用。`,
    `Contains ${unit.skill_count} related Skills grouped around one shared capability goal.`,
  );
}
