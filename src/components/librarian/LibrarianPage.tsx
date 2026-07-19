import type { OrbitMapModel, OrbitSystemNode, RankedSkillResult, SkillRecord } from "../../types";
import { cosmosIcons } from "../../lib/cosmosAssets";
import { CosmosAsset } from "../CosmosAsset";
import { SilentOrbitPortal } from "../console/SilentOrbitPortal";
import { LibrarianSearch } from "./LibrarianSearch";
import { RankedSkillCard } from "./RankedSkillCard";
import { useLocale } from "../../i18n/LocaleContext";

export interface LibrarianPageProps {
  queryDraft: string;
  submittedQuery: string;
  results: readonly RankedSkillResult[];
  orbitModel: OrbitMapModel;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onOpenSystem: (system: OrbitSystemNode, trigger: HTMLButtonElement) => void;
  onOpenSkill: (skill: SkillRecord) => void;
}

export function LibrarianPage({
  queryDraft,
  submittedQuery,
  results,
  orbitModel,
  onDraftChange,
  onSubmit,
  onClear,
  onOpenSystem,
  onOpenSkill,
}: LibrarianPageProps) {
  const { text } = useLocale();
  const visibleResults = results.slice(0, 3);

  return (
    <main className={`librarian-page ${submittedQuery ? "is-searching" : "is-idle"}`} data-page="librarian">
      <LibrarianSearch
        draft={queryDraft}
        submittedQuery={submittedQuery}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onClear={onClear}
      />
      <SilentOrbitPortal
        className="librarian-galaxy-portal"
        model={orbitModel}
        onOpenSystem={onOpenSystem}
      />
      <p className="sr-only librarian-status" aria-live="polite" aria-atomic="true">
        {submittedQuery
          ? visibleResults.length > 0
            ? text(`找到 ${visibleResults.length} 个匹配 Skills。`, `Found ${visibleResults.length} matching Skills.`)
            : text("没有匹配 Skills。", "No matching Skills.")
          : ""}
      </p>
      {submittedQuery && (
        <section aria-label={text("匹配 Skills", "Matching Skills")} className="librarian-results">
          <p className="librarian-results-heading archive-heading">
            <CosmosAsset className="archive-icon" src={cosmosIcons.skillSpark} />
            <span>TOP MATCHING SKILLS</span>
          </p>
          {visibleResults.length > 0 ? (
            <div className="librarian-result-grid">
              {visibleResults.map((result, index) => (
                <RankedSkillCard key={result.skill.name} order={index + 1} result={result} onOpen={onOpenSkill} />
              ))}
            </div>
          ) : (
            <p className="librarian-empty" role="status">
              {text("没有匹配信号，请换一种说法。", "NO MATCHING SIGNALS. TRY A DIFFERENT REQUEST.")}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
