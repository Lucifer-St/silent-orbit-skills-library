import { Sparkles } from "lucide-react";
import { isHighValueSkill } from "../../data/indexes";
import { useLocale } from "../../i18n/LocaleContext";
import type { SkillRecord } from "../../types";

export interface SkillListProps {
  skills: readonly SkillRecord[];
  onSkill: (skill: SkillRecord) => void;
  compact?: boolean;
  showGovernance?: boolean;
}

export function SkillList({ skills, onSkill, compact = false, showGovernance = false }: SkillListProps) {
  const { origin, skillDescription, text, visibility } = useLocale();
  if (skills.length === 0) {
    return <div className="empty-state">{text("没有匹配的 Skills。", "No matching Skills.")}</div>;
  }

  return (
    <div className={compact ? "skill-list compact" : "skill-list"}>
      {skills.map((skill) => (
        <button className="skill-row" key={skill.name} type="button" onClick={() => onSkill(skill)}>
          <span className="skill-row-title">
            {isHighValueSkill(skill) ? <Sparkles size={14} /> : null}
            {skill.name}
          </span>
          <span className="skill-row-desc">{skillDescription(skill)}</span>
          {showGovernance ? (
            <span className="skill-governance" aria-label={text("来源与公开边界", "Origin and visibility")}>
              <span>{origin(skill.origin)}</span>
              <span>{visibility(skill.visibility)}</span>
            </span>
          ) : null}
          <code>{skill.trigger}</code>
        </button>
      ))}
    </div>
  );
}
