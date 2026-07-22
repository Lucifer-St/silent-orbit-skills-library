import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  getLibraryForUnit,
  getSkillsForUnit,
  isHighValueUnit,
  librariesByKey,
} from "../../data/indexes";
import type { CategoryGroup, CategoryUnit, SkillRecord } from "../../types";
import { filterCategorySkills, getCanonicalUnitIdentity } from "../../lib/dataSelectors";
import { appData } from "../../generated/data.generated";
import { useLocale } from "../../i18n/LocaleContext";
import { AbilityUnitCard } from "./AbilityUnitCard";
import { StandaloneSkillGrid } from "./StandaloneSkillGrid";

export interface CatalogPageProps {
  categories: readonly CategoryGroup[];
  onCategory: (category: string) => void;
  onPrivate: () => void;
  onSources: () => void;
  onChanges: () => void;
  onMaintenance: () => void;
}

export function CatalogPage({ categories, onCategory, onPrivate, onSources, onChanges, onMaintenance }: CatalogPageProps) {
  const { category: categoryLabel, text } = useLocale();
  const secondaryEntries = [
    { key: "private", label: "PERSONAL DECK", detail: text("个人常用", "Personal curation") },
    { key: "sources", label: "SOURCES", detail: text("来源库速查", "Source index") },
    { key: "changes", label: "CHANGES", detail: text("变更记录", "Change log") },
    { key: "maintenance", label: "MAINTENANCE", detail: text("检查更新与本地交接", "Update status and local handoff") },
  ] as const;
  const secondaryHandlers = {
    private: onPrivate,
    sources: onSources,
    changes: onChanges,
    maintenance: onMaintenance,
  };

  return (
    <div className="page-stack catalog-page" data-page="catalog">
      <section className="page-header">
        <span className="pixel-label">FUNCTION CATALOG</span>
        <h1>{text("技能图鉴", "Skill Catalog")}</h1>
        <p>{text(
          "按真实工作目标进入一个星区，比较其中的能力单元、来源与单个 Skills。",
          "Enter a functional zone by real work goal, then compare capability units, sources, and individual Skills.",
        )}</p>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-category-heading">
        <div className="section-heading catalog-section-heading">
          <h2 id="catalog-category-heading">{text("功能分类", "Functional Zones")}</h2>
          <p>{text(`${categories.length} 个一级分类`, `${categories.length} primary categories`)}</p>
        </div>
        <div className="catalog-category-grid">
          {categories.map((category, index) => {
            const availableSkillCount = filterCategorySkills(
              appData.skills,
              librariesByKey,
              category,
              "",
              "all",
              false,
              appData.categorySkillNames,
            ).length;
            return (
              <button
                className="catalog-category-card"
                data-category-id={`category:${category.category}`}
                key={category.category}
                type="button"
                onClick={() => onCategory(category.category)}
              >
                <span className="catalog-category-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="catalog-category-copy">
                  <strong>{categoryLabel(category.category)}</strong>
                  <small>{availableSkillCount} SKILLS / {category.units.length} LIBRARIES</small>
                </span>
                <span className="catalog-category-enter" aria-hidden="true">
                  {text("进入星区", "ENTER ZONE")} <ArrowUpRight size={14} strokeWidth={1.4} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="catalog-section catalog-secondary-section" aria-labelledby="catalog-secondary-heading">
        <div className="section-heading catalog-section-heading">
          <h2 id="catalog-secondary-heading">{text("资料层", "Reference Layer")}</h2>
          <p>{text("个人精选、来源与变更记录", "Personal curation, sources, and change history")}</p>
        </div>
        <div className="catalog-secondary-grid">
          {secondaryEntries.map((entry, index) => (
            <button
              className="catalog-secondary-action"
              data-catalog-target={entry.key}
              key={entry.key}
              type="button"
              onClick={secondaryHandlers[entry.key]}
            >
              <span>0{index + 1}</span>
              <strong>{entry.label}</strong>
              <small>{entry.detail}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export interface CategoryPageProps {
  category: CategoryGroup;
  query: string;
  sourceFilter: string;
  starredOnly: boolean;
  expandedUnitId: string | null;
  onExpand: (id: string | null) => void;
  onSkill: (skill: SkillRecord) => void;
}

export function CategoryPage({
  category,
  query,
  sourceFilter,
  starredOnly,
  expandedUnitId,
  onExpand,
  onSkill,
}: CategoryPageProps) {
  const { category: categoryLabel, text } = useLocale();
  const matchingSkills = useMemo(
    () => filterCategorySkills(appData.skills, librariesByKey, category, query, sourceFilter, starredOnly, appData.categorySkillNames),
    [category, query, sourceFilter, starredOnly],
  );
  const matchingSkillNames = useMemo(
    () => new Set(matchingSkills.map((skill) => skill.name)),
    [matchingSkills],
  );
  const units = useMemo(() => {
    return category.units.filter((unit) => getSkillsForUnit(unit).some((skill) => matchingSkillNames.has(skill.name)));
  }, [category, matchingSkillNames]);

  const orphanSkills = useMemo(() => {
    const unitSkillNames = new Set(category.units.flatMap((unit) => unit.skills));
    return matchingSkills.filter(
      (skill) => !unitSkillNames.has(skill.name),
    );
  }, [category, matchingSkills]);

  const priorityUnits = units.filter(isHighValueUnit);
  const normalUnits = units.filter((unit) => !isHighValueUnit(unit));
  const hasAnyCategoryResult = priorityUnits.length > 0 || normalUnits.length > 0 || orphanSkills.length > 0;

  return (
    <div className="page-stack" data-page="category">
      <section className="page-header">
        <span className="pixel-label">FUNCTION ZONE</span>
        <h1>{categoryLabel(category.category)}</h1>
        <p>
          {text(
            `${filterCategorySkills(appData.skills, librariesByKey, category, "", "all", false, appData.categorySkillNames).length} 个可查看 Skills，${category.units.length} 个能力单元。库会作为整体出现，展开后查看库内 Skills。`,
            `${filterCategorySkills(appData.skills, librariesByKey, category, "", "all", false, appData.categorySkillNames).length} visible Skills across ${category.units.length} capability units. Expand a Library to inspect its Skills.`,
          )}
        </p>
      </section>

      {priorityUnits.length > 0 ? (
        <section className="unit-section priority-section">
          <div className="section-heading">
            <h2>{text("优先能力单元", "Priority Units")}</h2>
            <p>{text("按频率、重要性和来源信号自动抬高展示。", "Elevated by frequency, importance, and source signals.")}</p>
          </div>
          <UnitGrid
            units={priorityUnits}
            categoryName={category.category}
            matchingSkillNames={matchingSkillNames}
            expandedUnitId={expandedUnitId}
            onExpand={onExpand}
            onSkill={onSkill}
          />
        </section>
      ) : null}

      {normalUnits.length > 0 ? (
        <section className="unit-section">
          <div className="section-heading">
            <h2>{text("全部能力单元", "All Capability Units")}</h2>
            <p>{text("点击单元展开，再进入单个 Skill 详情。", "Expand a unit, then open an individual Skill.")}</p>
          </div>
          <UnitGrid
            units={normalUnits}
            categoryName={category.category}
            matchingSkillNames={matchingSkillNames}
            expandedUnitId={expandedUnitId}
            onExpand={onExpand}
            onSkill={onSkill}
          />
        </section>
      ) : null}

      {orphanSkills.length > 0 ? (
        <section className="unit-section standalone-skill-section">
          <div className="section-heading">
            <h2>{text("本分类的其他 Skills", "Other Skills in This Zone")}</h2>
            <p>{text("直接进入单个 Skill；保留真实来源，不把它们伪装成新的库单元。", "Open individual Skills directly while preserving their real source identity.")}</p>
          </div>
          <StandaloneSkillGrid skills={orphanSkills} onSkill={onSkill} />
        </section>
      ) : null}

      {!hasAnyCategoryResult ? <div className="empty-state">{text("当前筛选下没有匹配的能力单元或单独 Skills。", "No capability units or standalone Skills match these filters.")}</div> : null}
    </div>
  );
}

interface UnitGridProps {
  units: readonly CategoryUnit[];
  categoryName: string;
  matchingSkillNames: ReadonlySet<string>;
  expandedUnitId: string | null;
  onExpand: (id: string | null) => void;
  onSkill: (skill: SkillRecord) => void;
}

function UnitGrid({ units, categoryName, matchingSkillNames, expandedUnitId, onExpand, onSkill }: UnitGridProps) {
  const { text } = useLocale();
  if (units.length === 0) {
    return <div className="empty-state">{text("当前筛选下没有匹配的能力单元。", "No capability units match these filters.")}</div>;
  }

  return (
    <div className="unit-grid">
      {units.map((unit) => {
        const unitId = getStableUnitId(categoryName, unit);
        return (
          <AbilityUnitCard
            key={unitId}
            unit={unit}
            unitId={unitId}
            skills={getSkillsForUnit(unit).filter((skill) => matchingSkillNames.has(skill.name))}
            expanded={expandedUnitId === unitId}
            onToggle={() => onExpand(expandedUnitId === unitId ? null : unitId)}
            onSkill={onSkill}
          />
        );
      })}
    </div>
  );
}

function getStableUnitId(categoryName: string, unit: CategoryUnit) {
  const library = getLibraryForUnit(unit);
  return getCanonicalUnitIdentity(categoryName, unit, library);
}
