import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Languages,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { CatalogPage, CategoryPage } from "./components/catalog/CatalogPage";
import { SkillList } from "./components/catalog/SkillList";
import { AgentConsoleShell } from "./components/console/AgentConsoleShell";
import { CommandDeck } from "./components/console/CommandDeck";
import { FunctionRail } from "./components/console/FunctionRail";
import { HistoryPage } from "./components/history/HistoryPage";
import { OutcomeComposer } from "./components/history/OutcomeComposer";
import type { OutcomeComposerInput } from "./components/history/OutcomeComposer";
import { SkillInspector } from "./components/inspector/SkillInspector";
import { LibrarianPage } from "./components/librarian/LibrarianPage";
import { SilentOrbitPage } from "./components/orbit/SilentOrbitPage";
import {
  categoryGroups,
  changes,
  getCategoryByName,
  libraries,
  librariesByKey,
  maintenanceStatus,
  personalSkills,
  rankSkills,
} from "./data/indexes";
import { appData } from "./generated/data.generated";
import { useLocale } from "./i18n/LocaleContext";
import { useOrbitSurface } from "./hooks/useOrbitSurface";
import { usePersonalOutcomes } from "./hooks/usePersonalOutcomes";
import { catalogRevision } from "./lib/catalogRevision";
import { filterCategorySkills } from "./lib/dataSelectors";
import { buildOrbitMapModel } from "./lib/orbitModel";
import { currentPeriodOutcome } from "./lib/outcomePolicy";
import type { LibraryRecord, MaintenanceChannelRecord, OrbitSystemNode, PageKey, PersonalDataV1, SkillOutcome, SkillRecord } from "./types";

const allCategories = "all";
const allSources = "all";
const consolePages: readonly PageKey[] = ["librarian", "catalog", "category", "private", "sources", "changes", "maintenance", "history"];

function isPageKey(value: unknown): value is PageKey {
  return typeof value === "string" && consolePages.includes(value as PageKey);
}

function pageFromHistoryState(state: unknown): PageKey {
  if (!state || typeof state !== "object") return "librarian";
  const value = (state as { agentOsConsolePage?: unknown }).agentOsConsolePage;
  return isPageKey(value) ? value : "librarian";
}

function categoryFromHistoryState(state: unknown): string {
  if (!state || typeof state !== "object") return categoryGroups[0]?.category ?? "";
  const value = (state as { agentOsCategory?: unknown }).agentOsCategory;
  return typeof value === "string" && getCategoryByName(value) ? value : categoryGroups[0]?.category ?? "";
}

function skillFromHistoryState(state: unknown): SkillRecord | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as { agentOsSkill?: unknown }).agentOsSkill;
  return typeof value === "string" ? appData.skills.find((skill) => skill.name === value) ?? null : null;
}

export function App() {
  const [page, setPage] = useState<PageKey>(() => pageFromHistoryState(history.state));
  const [activeCategory, setActiveCategory] = useState(() => categoryFromHistoryState(history.state));
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(allCategories);
  const [sourceFilter, setSourceFilter] = useState(allSources);
  const [starredOnly, setStarredOnly] = useState(false);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillRecord | null>(() => skillFromHistoryState(history.state));
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerOutcomeId, setComposerOutcomeId] = useState<string | null>(null);
  const [orbitInitialCategoryId, setOrbitInitialCategoryId] = useState<string | null>(null);
  const skillTriggerRef = useRef<HTMLElement | null>(null);
  const skillTraversalInFlightRef = useRef(false);
  const composerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const personalOutcomes = usePersonalOutcomes();
  const { surface, orbitRef, openOrbit, closeOrbit } = useOrbitSurface();

  useEffect(() => {
    const currentState = history.state ?? {};
    if (!isPageKey(currentState.agentOsConsolePage)) {
      history.replaceState(
        {
          ...currentState,
          agentOsConsolePage: page,
          agentOsCategory: page === "category" ? activeCategory : null,
          agentOsSkill: selectedSkill?.name ?? null,
        },
        "",
      );
    }

    function handlePopState(event: PopStateEvent) {
      skillTraversalInFlightRef.current = false;
      const nextPage = pageFromHistoryState(event.state);
      const nextCategory = categoryFromHistoryState(event.state);
      setPage(nextPage);
      setActiveCategory(nextCategory);
      setCategoryFilter(nextPage === "category" ? nextCategory : allCategories);
      setSelectedSkill(skillFromHistoryState(event.state));
      setComposerOpen(false);
      setComposerOutcomeId(null);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page, surface]);

  const orbitModel = useMemo(() => buildOrbitMapModel(appData), []);
  const skillByName = useMemo(() => new Map(appData.skills.map((skill) => [skill.name, skill])), []);
  const categoryResultCount = useMemo(
    () => {
      const category = getCategoryByName(activeCategory);
      return category
        ? filterCategorySkills(appData.skills, librariesByKey, category, query, sourceFilter, starredOnly).length
        : 0;
    },
    [query, activeCategory, sourceFilter, starredOnly],
  );
  const rankedResults = useMemo(
    () => (submittedQuery ? rankSkills(submittedQuery, allCategories, allSources, false) : []),
    [submittedQuery],
  );
  const matchedSkillNames = useMemo(
    () => new Set(submittedQuery ? rankedResults.map((result) => result.skill.name) : []),
    [submittedQuery, rankedResults],
  );
  const activeCategoryGroup = getCategoryByName(activeCategory) ?? categoryGroups[0];
  const siblingSkills = useMemo(
    () => selectedSkill ? appData.skills.filter((skill) => skill.library_key === selectedSkill.library_key) : [],
    [selectedSkill],
  );
  const siblingIndex = selectedSkill ? siblingSkills.findIndex((skill) => skill.name === selectedSkill.name) : -1;
  const previousSkill = siblingSkills.length > 1 && siblingIndex >= 0
    ? siblingSkills[(siblingIndex - 1 + siblingSkills.length) % siblingSkills.length]
    : undefined;
  const nextSkill = siblingSkills.length > 1 && siblingIndex >= 0
    ? siblingSkills[(siblingIndex + 1) % siblingSkills.length]
    : undefined;
  const latestSelectedOutcome = useMemo(
    () => (selectedSkill ? latestOutcomeForSkill(personalOutcomes.data, selectedSkill.name) : undefined),
    [personalOutcomes.data, selectedSkill],
  );
  const composerOutcome = composerOutcomeId
    ? personalOutcomes.data.outcomes.find((outcome) => outcome.id === composerOutcomeId)
    : undefined;

  function openOrbitSystem(system: OrbitSystemNode, trigger: HTMLButtonElement) {
    setOrbitInitialCategoryId(system.id);
    openOrbit(trigger);
  }

  function consoleHistoryState(nextPage: PageKey, nextCategory?: string | null, nextSkill?: string | null) {
    const nextState = {
      ...(history.state ?? {}),
      agentOsConsolePage: nextPage,
      agentOsCategory: nextPage === "category" ? nextCategory ?? activeCategory : null,
      agentOsSkill: nextSkill ?? null,
    } as Record<string, unknown>;
    delete nextState.agentOsSurface;
    return nextState;
  }

  function navigatePage(nextPage: PageKey) {
    if (nextPage === "catalog") {
      setQuery("");
      setCategoryFilter(allCategories);
      setSourceFilter(allSources);
      setStarredOnly(false);
      setExpandedUnitId(null);
    }
    if (page !== nextPage || selectedSkill) {
      history.pushState(consoleHistoryState(nextPage), "");
    }
    setPage(nextPage);
    setSelectedSkill(null);
    setComposerOpen(false);
    setComposerOutcomeId(null);
  }

  function openCategory(categoryName: string) {
    if (page !== "category" || activeCategory !== categoryName || selectedSkill) {
      history.pushState(consoleHistoryState("category", categoryName), "");
    }
    setPage("category");
    setActiveCategory(categoryName);
    setCategoryFilter(categoryName);
    setExpandedUnitId(null);
  }

  function openCategoryFromOrbit(categoryName: string) {
    history.replaceState(consoleHistoryState("category", categoryName), "");
    setPage("category");
    setActiveCategory(categoryName);
    setCategoryFilter(categoryName);
    setExpandedUnitId(null);
    closeOrbit();
  }

  function resetFilters() {
    setQuery("");
    setCategoryFilter(page === "category" ? activeCategory : allCategories);
    setSourceFilter(allSources);
    setStarredOnly(false);
  }

  function openSkill(skill: SkillRecord) {
    skillTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    skillTraversalInFlightRef.current = false;
    const nextState = { ...(history.state ?? {}), agentOsSkill: skill.name };
    if (history.state?.agentOsSkill) history.replaceState(nextState, "");
    else history.pushState(nextState, "");
    setComposerOpen(false);
    setComposerOutcomeId(null);
    setSelectedSkill(skill);
  }

  function closeSkill() {
    if (skillTraversalInFlightRef.current) return;
    if (history.state?.agentOsSkill) {
      skillTraversalInFlightRef.current = true;
      history.back();
      return;
    }
    setComposerOpen(false);
    setComposerOutcomeId(null);
    setSelectedSkill(null);
  }

  function selectSiblingSkill(skill: SkillRecord) {
    history.replaceState({ ...(history.state ?? {}), agentOsSkill: skill.name }, "");
    setComposerOpen(false);
    setComposerOutcomeId(null);
    setSelectedSkill(skill);
  }

  function openOutcomeComposer(trigger: HTMLButtonElement) {
    if (!selectedSkill) return;
    composerTriggerRef.current = trigger;
    setComposerOutcomeId(
      currentPeriodOutcome(personalOutcomes.data, selectedSkill.name, new Date())?.id ?? null,
    );
    setComposerOpen(true);
  }

  function saveOutcome(input: OutcomeComposerInput): boolean {
    if (!selectedSkill) return false;
    const revision = catalogRevision(selectedSkill);
    const saved = composerOutcomeId
      ? personalOutcomes.updateOutcome(composerOutcomeId, { ...input, catalogRevision: revision })
      : personalOutcomes.recordOutcome({ ...input, skillId: selectedSkill.name, catalogRevision: revision });
    if (saved) setComposerOpen(false);
    return saved;
  }

  const activeSurface = surface === "orbit" ? (
    <SilentOrbitPage
      model={orbitModel}
      initialCategoryId={orbitInitialCategoryId}
      fallbackCategories={categoryGroups}
      searchActive={Boolean(submittedQuery)}
      matchedSkillNames={matchedSkillNames}
      skillByName={skillByName}
      onSkill={openSkill}
      onFallbackCategory={(category) => {
        openCategoryFromOrbit(category);
      }}
      onClose={closeOrbit}
      orbitRef={orbitRef}
    />
  ) : (
    <AgentConsoleShell
      page={page}
      onHome={() => navigatePage("librarian")}
      nav={<ConsoleNav page={page} onPage={navigatePage} />}
      rail={
        page === "category" ? (
          <FunctionRail
            page={page}
            activeCategory={activeCategory}
            categories={categoryGroups}
            onCategory={openCategory}
          />
        ) : undefined
      }
      commandDeck={
        page === "category" ? (
          <CommandDeck
            query={query}
            categoryFilter={categoryFilter}
            sourceFilter={sourceFilter}
            starredOnly={starredOnly}
            resultCount={categoryResultCount}
            onQueryChange={setQuery}
            onCategoryChange={(value) => {
              setCategoryFilter(value);
              if (value === allCategories) navigatePage("catalog");
              else openCategory(value);
            }}
            onSourceChange={setSourceFilter}
            onStarredChange={setStarredOnly}
            onReset={resetFilters}
          />
        ) : null
      }
    >
      {page === "librarian" && (
        <LibrarianPage
          queryDraft={queryDraft}
          submittedQuery={submittedQuery}
          results={rankedResults}
          orbitModel={orbitModel}
          onDraftChange={setQueryDraft}
          onSubmit={() => setSubmittedQuery(queryDraft.trim())}
          onClear={() => {
            setQueryDraft("");
            setSubmittedQuery("");
          }}
          onOpenSystem={openOrbitSystem}
          onOpenSkill={openSkill}
        />
      )}
      {page === "catalog" && (
        <CatalogPage
          categories={categoryGroups}
          onCategory={openCategory}
          onPrivate={() => navigatePage("private")}
          onSources={() => navigatePage("sources")}
          onChanges={() => navigatePage("changes")}
          onMaintenance={() => navigatePage("maintenance")}
        />
      )}
      {page === "category" && activeCategoryGroup && (
        <CategoryPage
          category={activeCategoryGroup}
          query={query}
          sourceFilter={sourceFilter}
          starredOnly={starredOnly}
          expandedUnitId={expandedUnitId}
          onExpand={setExpandedUnitId}
          onSkill={openSkill}
        />
      )}
      {page === "private" && <PrivateToolboxPage onSkill={openSkill} />}
      {page === "sources" && <SourcesPage />}
      {page === "changes" && <ChangesPage />}
      {page === "maintenance" && <MaintenancePage />}
      {page === "history" && (
        <HistoryPage
          data={personalOutcomes.data}
          error={personalOutcomes.error}
          onDelete={personalOutcomes.deleteOutcome}
          onExport={personalOutcomes.exportData}
          onImport={personalOutcomes.importData}
        />
      )}
    </AgentConsoleShell>
  );

  return (
    <div
      className="app-shell"
      data-active-surface={surface}
      data-inspector-open={selectedSkill ? "true" : undefined}
    >
      <div className="app-content" inert={selectedSkill ? true : undefined} aria-hidden={selectedSkill ? true : undefined}>
        {activeSurface}
      </div>

      {selectedSkill && (
        <SkillInspector
          skill={selectedSkill}
          latestOutcome={latestSelectedOutcome}
          composerOpen={composerOpen}
          showCatalogArrival={surface === "console" && page === "category"}
          showOrbitCaption={surface === "orbit"}
          previousSkill={previousSkill}
          nextSkill={nextSkill}
          returnFocusTo={skillTriggerRef.current}
          onSelectSkill={selectSiblingSkill}
          onRecordOutcome={openOutcomeComposer}
          onClose={closeSkill}
        />
      )}

      {selectedSkill && composerOpen && (
        <OutcomeComposer
          skill={selectedSkill}
          existingOutcome={composerOutcome}
          returnFocusTo={composerTriggerRef.current}
          error={personalOutcomes.error}
          onSave={saveOutcome}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  );
}

function ConsoleNav({
  page,
  onPage,
}: {
  page: PageKey;
  onPage: (page: PageKey) => void;
}) {
  const { locale, text, toggleLocale } = useLocale();
  const catalogActive = page === "catalog" || page === "category" || page === "private" || page === "sources" || page === "changes" || page === "maintenance";

  return (
    <nav className="topnav" aria-label={text("主导航", "Main navigation")}>
      <NavButton active={page === "librarian"} icon={<BookOpen size={16} />} label="LIBRARIAN" onClick={() => onPage("librarian")} />
      <NavButton active={catalogActive} icon={<Database size={16} />} label="CATALOG" onClick={() => onPage("catalog")} />
      <NavButton active={page === "history"} icon={<Clock3 size={16} />} label="HISTORY" onClick={() => onPage("history")} />
      <button
        className="nav-button language-toggle"
        data-locale={locale}
        type="button"
        aria-label={text("切换为英文", "Switch to Chinese")}
        onClick={toggleLocale}
      >
        <Languages size={16} />
        <span>{locale === "zh-CN" ? "EN" : "中"}</span>
      </button>
    </nav>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      data-nav-label={label}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PrivateToolboxPage({ onSkill }: { onSkill: (skill: SkillRecord) => void }) {
  const { text } = useLocale();
  return (
    <div className="page-stack" data-page="private">
      <section className="page-header private-header">
        <span className="pixel-label">PERSONAL DECK</span>
        <h1>{text("个人常用", "Personal Deck")}</h1>
        <p>{text(
          "这里收纳长期使用的自建与第三方 Skills；作者来源与公开边界分别标注。",
          "A curated mix of creator-built and third-party Skills, with authorship and visibility labeled independently.",
        )}</p>
      </section>
      <SkillList skills={personalSkills} onSkill={onSkill} showGovernance />
    </div>
  );
}

function SourcesPage() {
  const { text } = useLocale();
  return (
    <div className="page-stack" data-page="sources">
      <section className="page-header">
        <span className="pixel-label">SOURCE INDEX</span>
        <h1>{text("来源库速查", "Source Index")}</h1>
        <p>{text(
          "查看每个能力单元的来源、类型和范围。global 只作为来源记录，不合并成大型能力单元。",
          "Review the origin, type, and scope of each capability unit. Global remains a source record rather than a merged mega-unit.",
        )}</p>
      </section>
      <div className="source-table">
        {libraries.map((library) => (
          <SourceRow library={library} key={library.key} />
        ))}
      </div>
    </div>
  );
}

function SourceRow({ library }: { library: LibraryRecord }) {
  const { category, libraryDescription, libraryTitle, metadataLabel, text } = useLocale();
  return (
    <article className={`source-row ${library.key === "local:global" ? "source-global" : ""}`}>
      <div>
        <strong>{libraryTitle(library)}</strong>
        <p>{libraryDescription(library)}</p>
      </div>
      <div className="source-facts">
        <span>{metadataLabel(library.kind_label ?? library.kind)}</span>
        <span>{library.skills.length} skills</span>
        <span>{library.primary_category ? category(library.primary_category) : "multi"}</span>
      </div>
      {library.source_url && (
        <a href={library.source_url} target="_blank" rel="noreferrer" aria-label={text(`打开 ${library.title} 来源`, `Open source for ${library.title}`)}>
          <ExternalLink size={16} />
        </a>
      )}
    </article>
  );
}

function ChangesPage() {
  const { locale, text } = useLocale();
  return (
    <div className="page-stack" data-page="changes">
      <section className="page-header">
        <span className="pixel-label">CHANGE LOG</span>
        <h1>{text("变更记录", "Change Log")}</h1>
        <p>{text(
          "v0 先展示基础快照；后续安装、删除、更新和来源变化都会写入这里。",
          "v0 starts with a baseline snapshot; future installs, removals, updates, and source changes will be recorded here.",
        )}</p>
      </section>
      <div className="timeline">
        {changes.map((change) => (
          <article className="timeline-item" key={change.id}>
            <span>{change.date ? new Date(change.date).toLocaleString(locale) : text("未记录时间", "Time not recorded")}</span>
            <strong>{change.title_i18n?.[locale] ?? change.title}</strong>
            <p>{change.summary_i18n?.[locale] ?? change.summary}</p>
          </article>
        ))}
      </div>
      <div className="sync-note">
        <ShieldCheck size={18} />
        {text("数据快照日期", "Snapshot date")}: {appData.generatedAt.slice(0, 10)}
      </div>
    </div>
  );
}

function MaintenancePage() {
  const { locale, text } = useLocale();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const prompt = maintenanceStatus.handoffPrompt[locale] ?? maintenanceStatus.handoffPrompt["zh-CN"] ?? "";

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="page-stack maintenance-page" data-page="maintenance">
      <section className="page-header">
        <span className="pixel-label">MAINTENANCE LINK</span>
        <h1>{text("维护与更新", "Maintenance & Updates")}</h1>
        <p>{text(
          "这里展示最近一次经过清洗的维护快照，并把更新任务安全地交给本地 Codex。网页不会直接读取或修改你的电脑。",
          "This page shows the latest sanitized maintenance snapshot and safely hands update work to local Codex. The website never reads or changes your computer directly.",
        )}</p>
      </section>

      <section className="maintenance-summary" aria-labelledby="maintenance-snapshot-title">
        <div className="section-heading">
          <h2 id="maintenance-snapshot-title">{text("公开快照", "Public Snapshot")}</h2>
          <p>{maintenanceStatus.snapshotDate}</p>
        </div>
        <div className="maintenance-metrics">
          <article><strong>{maintenanceStatus.catalogSkills}</strong><span>{text("公开目录 Skills", "public catalog Skills")}</span></article>
          <article><strong>{maintenanceStatus.publicGlobalSkills}</strong><span>{text("公开全局 Skills", "public global Skills")}</span></article>
          <article><strong>{maintenanceStatus.privacy === "sanitized" ? "SAFE" : "CHECK"}</strong><span>{text("私有数据隔离", "private data boundary")}</span></article>
        </div>
      </section>

      <section className="maintenance-channels" aria-labelledby="maintenance-channel-title">
        <div className="section-heading">
          <h2 id="maintenance-channel-title">{text("更新通道", "Update Channels")}</h2>
          <p>{text("不同来源不能共用一个更新结论", "Each source keeps its own update state")}</p>
        </div>
        <div className="maintenance-channel-grid">
          {maintenanceStatus.channels.map((channel) => <MaintenanceChannel channel={channel} key={channel.id} />)}
        </div>
      </section>

      <section className="maintenance-handoff" aria-labelledby="maintenance-handoff-title">
        <div className="maintenance-handoff-copy">
          <TerminalSquare size={20} />
          <div>
            <h2 id="maintenance-handoff-title">{text("交给本地 Codex", "Hand Off to Local Codex")}</h2>
            <p>{text(
              "复制下面的请求。Codex 会先扫描和展示计划；安装、删除或更新仍需要你的确认。",
              "Copy the request below. Codex scans and shows a plan first; installs, removals, and updates still require your approval.",
            )}</p>
          </div>
        </div>
        <code>{prompt}</code>
        <button className="maintenance-copy-button" data-maintenance-action="copy-handoff" type="button" onClick={copyHandoff}>
          <Copy size={16} />
          {copyState === "copied" ? text("已复制", "COPIED") : text("复制维护请求", "COPY MAINTENANCE REQUEST")}
        </button>
        <span className={`maintenance-copy-status ${copyState}`} aria-live="polite">
          {copyState === "copied" ? text("请求已复制到剪贴板。", "Request copied to the clipboard.") : null}
          {copyState === "error" ? text("浏览器无法访问剪贴板，请手动复制上方文本。", "Clipboard access failed; copy the text above manually.") : null}
        </span>
      </section>
    </div>
  );
}

function MaintenanceChannel({ channel }: { channel: MaintenanceChannelRecord }) {
  const { text } = useLocale();
  const labels = {
    "source-managed-global": text("来源可追踪的全局 Skills", "Source-managed global Skills"),
    plugins: text("插件提供的 Skills", "Plugin-provided Skills"),
    system: text("系统 Skills", "System Skills"),
  } as Record<string, string>;
  const states = {
    current: text("已检查范围为最新", "Checked scope is current"),
    "update-available": text("发现可用更新", "Updates are available"),
    unchecked: text("尚未可靠检查", "Not reliably checked yet"),
    external: text("由插件工作流管理", "Managed by the plugin workflow"),
    "system-managed": text("跟随 Codex 运行时", "Follows the Codex runtime"),
    error: text("检查失败", "Check failed"),
  } as Record<string, string>;
  const Icon = channel.state === "current" ? CheckCircle2 : RefreshCw;
  return (
    <article className="maintenance-channel-card" data-maintenance-channel={channel.id} data-maintenance-state={channel.state}>
      <Icon size={18} />
      <strong>{labels[channel.id] ?? channel.id}</strong>
      <span>{states[channel.state] ?? channel.state}</span>
      {typeof channel.checkedSources === "number" ? <small>{text(`${channel.checkedSources} 个可追踪来源`, `${channel.checkedSources} traceable sources`)}</small> : null}
    </article>
  );
}

function compareOutcomesNewestFirst(left: SkillOutcome, right: SkillOutcome): number {
  const timeDifference = Date.parse(right.completedAt) - Date.parse(left.completedAt);
  return timeDifference || left.id.localeCompare(right.id);
}

function latestOutcomeForSkill(data: PersonalDataV1, skillId: string): SkillOutcome | undefined {
  return data.outcomes
    .filter((outcome) => outcome.skillId === skillId)
    .sort(compareOutcomesNewestFirst)[0];
}
