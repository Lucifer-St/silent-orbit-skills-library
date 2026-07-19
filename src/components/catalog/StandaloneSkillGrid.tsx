import type { SkillRecord } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";

export interface StandaloneSkillGridProps {
  readonly skills: readonly SkillRecord[];
  readonly onSkill: (skill: SkillRecord) => void;
}

export function StandaloneSkillGrid({ skills, onSkill }: StandaloneSkillGridProps) {
  const { libraryTitle, skillDescription, text } = useLocale();
  return (
    <div className="standalone-skill-grid">
      {skills.map((skill) => (
        <button
          className="standalone-skill-card"
          data-standalone-skill={skill.name}
          key={skill.name}
          type="button"
          aria-label={text(`打开 Skill：${skill.name}`, `Open Skill: ${skill.name}`)}
          onClick={() => onSkill(skill)}
        >
          <span className="unit-kind">{text("直接进入", "DIRECT ACCESS")}</span>
          <strong>{skill.name}</strong>
          <p>{skillDescription(skill)}</p>
          <span className="standalone-skill-source">{libraryTitle(undefined, skill.library_title)}</span>
          <code>{skill.trigger}</code>
        </button>
      ))}
    </div>
  );
}
