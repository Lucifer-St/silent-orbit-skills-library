import { useMemo } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  getLibraryForUnit,
  getSkillsForUnit,
  isHighValueUnit,
  librariesByKey,
} from "../../data/indexes";
import type { CategoryGroup, CategoryUnit, SkillRecord } from "../../types";
import { filterCategorySkills, getCanonicalUnitIdentity } from "../../lib/dataSelectors";
import { getLibraryVisual, getRelicVisual, getSkillVisual } from "../../lib/cosmosAssets";
import { appData } from "../../generated/data.generated";
import { useLocale } from "../../i18n/LocaleContext";
import { CosmosAsset } from "../CosmosAsset";
import { SkillList } from "./SkillList";
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
  coordinateRail: ReactNode;
  commandDeck: ReactNode;
  query: string;
  sourceFilter: string;
  starredOnly: boolean;
  selectedUnitId: string | null;
  onSelectUnit: (id: string) => void;
  onSkill: (skill: SkillRecord) => void;
  onBackToCatalog: () => void;
}

export function CategoryPage({
  category,
  coordinateRail,
  commandDeck,
  query,
  sourceFilter,
  starredOnly,
  selectedUnitId,
  onSelectUnit,
  onSkill,
  onBackToCatalog,
}: CategoryPageProps) {
  const {
    category: categoryLabel,
    libraryDescription,
    libraryTitle,
    metadataLabel,
    text,
  } = useLocale();
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
  const orderedUnits = [...priorityUnits, ...normalUnits];
  const selectedUnit = orderedUnits.find((unit) => getStableUnitId(category.category, unit) === selectedUnitId)
    ?? orderedUnits[0];
  const resolvedUnitId = selectedUnit ? getStableUnitId(category.category, selectedUnit) : null;
  const selectedLibrary = selectedUnit ? getLibraryForUnit(selectedUnit) : undefined;
  const selectedSkills = selectedUnit
    ? getSkillsForUnit(selectedUnit).filter((skill) => matchingSkillNames.has(skill.name))
    : [];
  const categoryIndex = Math.max(0, appData.categoryUnits.findIndex((item) => item.category === category.category));
  const totalSkillCount = filterCategorySkills(
    appData.skills,
    librariesByKey,
    category,
    "",
    "all",
    false,
    appData.categorySkillNames,
  ).length;
  const hasAnyCategoryResult = priorityUnits.length > 0 || normalUnits.length > 0 || orphanSkills.length > 0;

  return (
    <div className="page-stack category-folio-page" data-page="category">
      <section className="page-header category-folio-header">
        <button className="category-folio-back" type="button" onClick={onBackToCatalog}>
          <ArrowLeft aria-hidden="true" size={13} strokeWidth={1.5} />
          {text("返回全部目录", "ALL CATALOG")}
        </button>
        <span className="pixel-label">FUNCTION CATALOG / {String(categoryIndex + 1).padStart(2, "0")}</span>
        <h1>{categoryLabel(category.category)}</h1>
        <p>
          {text(
            `${totalSkillCount} 个可查看 Skills，${category.units.length} 个能力单元。库会作为整体出现，展开后查看库内 Skills。`,
            `${totalSkillCount} visible Skills across ${category.units.length} capability units. Expand a Library to inspect its Skills.`,
          )}
        </p>
      </section>

      <div className="category-coordinate-rail">{coordinateRail}</div>
      <div className="category-command-line">{commandDeck}</div>

      {orderedUnits.length > 0 && selectedUnit ? (
        <section className="category-folio" aria-label={text("分类档案", "Category folio")}>
          <aside className="category-library-index" aria-label={text("全部能力单元", "All capability units")}>
            <div className="category-library-index-heading">
              <span>{text("全部能力单元", "ALL LIBRARIES")}</span>
              <strong>{orderedUnits.length}</strong>
            </div>
            <div className="unit-grid">
              {orderedUnits.map((unit, index) => {
                const unitId = getStableUnitId(category.category, unit);
                const library = getLibraryForUnit(unit);
                const unitSkills = getSkillsForUnit(unit).filter((skill) => matchingSkillNames.has(skill.name));
                const active = unitId === resolvedUnitId;
                return (
                  <article
                    className={`unit-card ${isHighValueUnit(unit) ? "priority" : ""}`}
                    data-active={active}
                    data-unit-id={unitId}
                    key={unitId}
                  >
                    <button
                      className="unit-card-main"
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onSelectUnit(unitId)}
                    >
                      <span className="unit-kind">{metadataLabel(unit.kind ?? unit.type)}</span>
                      <strong>{libraryTitle(library, unit.title)}</strong>
                      <small>{String(index + 1).padStart(2, "0")} / {unitSkills.length} SKILLS</small>
                    </button>
                  </article>
                );
              })}
            </div>
          </aside>

          <section className="category-skill-folio" aria-labelledby="selected-library-title">
            <header className="category-skill-folio-header">
              <span>LIBRARY</span>
              <h2 id="selected-library-title">{libraryTitle(selectedLibrary, selectedUnit.title)}</h2>
              <p>{libraryDescription(selectedLibrary, text(
                `包含 ${selectedSkills.length} 个相关 Skills，按真实来源归档。`,
                `${selectedSkills.length} related Skills, preserved under their real source.`,
              ))}</p>
              <div>
                <span>{selectedSkills.length} SKILLS</span>
                <span>{metadataLabel(selectedLibrary?.source_label ?? selectedUnit.type)}</span>
                {selectedLibrary?.source_url ? (
                  <a href={selectedLibrary.source_url} target="_blank" rel="noreferrer">
                    {text("查看来源", "VIEW SOURCE")}
                  </a>
                ) : null}
              </div>
            </header>
            <SkillList skills={selectedSkills} onSkill={onSkill} compact />
          </section>

          <aside className="category-cosmos-specimen" aria-label={text("天体标本", "Celestial specimen")}>
            <span className="category-specimen-kicker">ARCHIVE SPECIMEN</span>
            <CosmosAsset
              className="category-specimen-body"
              src={getLibraryVisual(resolvedUnitId ?? category.category)}
            />
            <div className="category-specimen-fact">
              <span>LIBRARY BODY</span>
              <strong>{String(categoryIndex + 1).padStart(2, "0")}·{String(selectedSkills.length).padStart(2, "0")}</strong>
            </div>
            <CosmosAsset
              className="category-specimen-echo"
              src={getSkillVisual(`${resolvedUnitId ?? category.category}:echo`)}
            />
            <div className="category-specimen-fact">
              <span>WEAK SIGNAL</span>
              <strong>{matchingSkills.length} / {totalSkillCount}</strong>
            </div>
            <CosmosAsset
              className="category-specimen-relic"
              src={getRelicVisual(categoryIndex)}
            />
            <div className="category-specimen-fact">
              <span>ARCHIVE RELIC</span>
              <strong>{metadataLabel(selectedUnit.kind ?? selectedUnit.type)}</strong>
            </div>
          </aside>
        </section>
      ) : null}

      {orphanSkills.length > 0 ? (
        <section className="unit-section standalone-skill-section category-orphan-signals">
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

function getStableUnitId(categoryName: string, unit: CategoryUnit) {
  const library = getLibraryForUnit(unit);
  return getCanonicalUnitIdentity(categoryName, unit, library);
}
