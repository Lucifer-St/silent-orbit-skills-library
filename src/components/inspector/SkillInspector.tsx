import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { librariesByKey, skillDetailsByName } from "../../data/indexes";
import { cosmosIcons, getCatalogArrivalVisual, getSkillVisual } from "../../lib/cosmosAssets";
import type { SkillOutcome, SkillRecord } from "../../types";
import { CosmosAsset } from "../CosmosAsset";
import { useLocale } from "../../i18n/LocaleContext";

interface SkillInspectorProps {
  readonly skill: SkillRecord;
  readonly latestOutcome?: SkillOutcome;
  readonly composerOpen: boolean;
  readonly showCatalogArrival: boolean;
  readonly showOrbitCaption: boolean;
  readonly previousSkill?: SkillRecord;
  readonly nextSkill?: SkillRecord;
  readonly returnFocusTo: HTMLElement | null;
  readonly onSelectSkill: (skill: SkillRecord) => void;
  readonly onRecordOutcome: (trigger: HTMLButtonElement) => void;
  readonly onClose: () => void;
}

export function SkillInspector({
  skill,
  latestOutcome,
  composerOpen,
  showCatalogArrival,
  showOrbitCaption,
  previousSkill,
  nextSkill,
  returnFocusTo,
  onSelectSkill,
  onRecordOutcome,
  onClose,
}: SkillInspectorProps) {
  const {
    category,
    installStatus,
    libraryTitle,
    locale,
    metadataLabel,
    origin,
    skillDescription,
    text,
    visibility,
  } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusTo);
  const [displayedArrivalVisual, setDisplayedArrivalVisual] = useState<string>();
  const titleId = useId();
  const descriptionId = useId();
  const library = librariesByKey.get(skill.library_key);
  const verifiedDetails = skillDetailsByName.get(skill.name);
  const skillVisual = getSkillVisual(skill.name);
  const catalogArrivalVisual = showCatalogArrival ? getCatalogArrivalVisual(skill.name) : undefined;
  const hasRelatedDetails = Boolean(
    library?.kind_label ||
      library?.source_label ||
      skill.repo ||
      (skill.star_tier && skill.star_tier !== "none") ||
      skill.repo_url ||
      library?.source_url,
  );

  useEffect(() => {
    if (!catalogArrivalVisual) {
      setDisplayedArrivalVisual(undefined);
      return;
    }

    let cancelled = false;
    const image = new Image();
    const revealDecodedImage = () => {
      if (!cancelled && image.complete && image.naturalWidth > 0) {
        setDisplayedArrivalVisual(catalogArrivalVisual);
      }
    };
    image.onload = revealDecodedImage;
    image.src = catalogArrivalVisual;
    if (typeof image.decode === "function") void image.decode().then(revealDecodedImage).catch(() => undefined);
    else if (image.complete) revealDecodedImage();

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [catalogArrivalVisual]);

  useEffect(() => {
    dialogRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [skill.name]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      const trigger = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    };
  }, []);

  useEffect(() => {
    if (composerOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [composerOpen, onClose]);

  function keepFocusInDialog(event: ReactKeyboardEvent<HTMLElement>) {
    if (composerOpen || event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {showCatalogArrival && displayedArrivalVisual && (
        <CosmosAsset
          key={displayedArrivalVisual}
          className="silent-horizon-environment"
          dataArrivalSkill={skill.name}
          src={displayedArrivalVisual}
        />
      )}
      {(showCatalogArrival || showOrbitCaption) && (
        <div
          className="silent-horizon-caption"
          data-arrival-context={showCatalogArrival ? "catalog" : "orbit"}
          key={`arrival-caption:${skill.name}`}
          aria-hidden="true"
        >
          <span>SILENT HORIZON / SKILL SIGNAL</span>
          <strong>{skill.name}</strong>
          <small>
            {showCatalogArrival
              ? `${category(skill.category)} · ARRIVAL CONFIRMED`
              : `${libraryTitle(library, skill.library_title)} · ORBIT LOCKED`}
          </small>
        </div>
      )}
      <div className="drawer-backdrop" aria-hidden="true" />
      <aside
        ref={dialogRef}
        className="drawer"
        data-surface="skill-inspector"
        role="dialog"
        aria-modal={composerOpen ? undefined : true}
        aria-hidden={composerOpen ? true : undefined}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        inert={composerOpen ? true : undefined}
        tabIndex={-1}
        onKeyDown={keepFocusInDialog}
      >
      <div className="drawer-header">
        <div className="inspector-title-lockup">
          <CosmosAsset className="inspector-title-signal" src={skillVisual} />
          <div>
            <span className="pixel-label">SKILL DETAIL</span>
            <h2 id={titleId} aria-live="polite" aria-atomic="true">{skill.name}</h2>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={text("关闭详情", "Close detail")}>
          <X size={18} />
        </button>
      </div>

      {previousSkill && nextSkill ? (
        <nav className="inspector-sibling-nav" aria-label={text("同一来源单元中的相邻 Skills", "Adjacent Skills in the same source unit")}>
          <button
            type="button"
            data-inspector-sibling="previous"
            aria-label={text(`上一个 Skill：${previousSkill.name}`, `Previous Skill: ${previousSkill.name}`)}
            onClick={() => onSelectSkill(previousSkill)}
          >
            <ChevronLeft size={16} />
            <span><small>PREVIOUS</small><strong>{previousSkill.name}</strong></span>
          </button>
          <button
            type="button"
            data-inspector-sibling="next"
            aria-label={text(`下一个 Skill：${nextSkill.name}`, `Next Skill: ${nextSkill.name}`)}
            onClick={() => onSelectSkill(nextSkill)}
          >
            <span><small>NEXT</small><strong>{nextSkill.name}</strong></span>
            <ChevronRight size={16} />
          </button>
        </nav>
      ) : null}

      <section className="drawer-section inspector-purpose">
        <h3>{text("用途", "Purpose")}</h3>
        <p className="drawer-desc" id={descriptionId}>{skillDescription(skill)}</p>
      </section>

      <div className="detail-grid inspector-quick-facts">
        <DetailItem label={text("功能分类", "Category")} value={category(skill.category)} />
        <DetailItem label={text("来源单元", "Source unit")} value={libraryTitle(library, skill.library_title)} />
        <DetailItem label={text("创作来源", "Origin")} value={origin(skill.origin)} />
        <DetailItem label={text("公开边界", "Visibility")} value={visibility(skill.visibility)} />
        <DetailItem label={text("安装状态", "Install status")} value={installStatus(skill.status)} />
        {skill.frequency ? <DetailItem label={text("使用信号", "Usage signal")} value={humanizeFrequency(skill.frequency, text)} /> : null}
      </div>

      <section className="drawer-section inspector-trigger">
        <h3>{text("何时触发", "When to Trigger")}</h3>
        <p>{text("任务与下面的边界一致时，直接点名触发词，并补充目标、输入材料和期望输出。", "Use the trigger when the task matches this boundary, then provide the goal, inputs, and expected output.")}</p>
        <code>{skill.trigger}</code>
      </section>

      <section className="drawer-section inspector-boundaries">
        <h3>{text("适合 / 不适合", "Good Fit / Poor Fit")}</h3>
        <div>
          <article>
            <span>{text("适合", "GOOD FIT")}</span>
            <p>{makeUseCase(skill, skillDescription(skill), text)}</p>
          </article>
          <article>
            <span>{text("不适合", "POOR FIT")}</span>
            <p>{makeBoundary(skill, text)}</p>
          </article>
        </div>
      </section>

      {verifiedDetails && (
        <section className="drawer-section inspector-source-details">
          <ArchiveSectionTitle asset={cosmosIcons.verified}>VERIFIED DETAILS</ArchiveSectionTitle>
          <p><strong>{verifiedDetails.author}</strong></p>
          <p>{verifiedDetails.sourceSummary}</p>
          <a className="source-link" href={verifiedDetails.sourceUrl} target="_blank" rel="noreferrer">
            OPEN VERIFIED SOURCE
            <ExternalLink size={14} />
          </a>
          {verifiedDetails.examples.map((example) => (
            <article className="inspector-source-example" key={example.url}>
              <a href={example.url} target="_blank" rel="noreferrer">{example.title}</a>
              {example.summary && <p>{example.summary}</p>}
            </article>
          ))}
        </section>
      )}

      {latestOutcome && (
        <section className="drawer-section inspector-latest-outcome">
          <ArchiveSectionTitle asset={cosmosIcons.recordedOutcome}>LATEST PERSONAL OUTCOME</ArchiveSectionTitle>
          <time dateTime={latestOutcome.completedAt}>{new Date(latestOutcome.completedAt).toLocaleString(locale)}</time>
          <strong>{latestOutcome.title}</strong>
          {latestOutcome.note && <p className="outcome-note">{latestOutcome.note}</p>}
          {latestOutcome.artifactRef && <code data-wrap-kind="path">{latestOutcome.artifactRef}</code>}
        </section>
      )}

      <button
        className="primary-button outcome-record-button"
        type="button"
        onClick={(event) => onRecordOutcome(event.currentTarget)}
      >
        <CosmosAsset className="archive-button-icon" src={cosmosIcons.recordedOutcome} />
        RECORD OUTCOME
      </button>

      {hasRelatedDetails && <section className="drawer-section">
        <ArchiveSectionTitle asset={cosmosIcons.externalSource}>{text("相关工具 / 插件 / 来源", "RELATED TOOLS / PLUGINS / SOURCES")}</ArchiveSectionTitle>
        <div className="related-list">
          {library?.kind_label && <span>{metadataLabel(library.kind_label)}</span>}
          {library?.source_label && <span>{metadataLabel(library.source_label)}</span>}
          {skill.repo && <span>{skill.repo}</span>}
          {skill.star_tier && skill.star_tier !== "none" && <span>{skill.star_tier}</span>}
        </div>
        {(skill.repo_url || library?.source_url) && (
          <a className="source-link" href={(skill.repo_url ?? library?.source_url) || undefined} target="_blank" rel="noreferrer">
            {text("打开来源证据", "OPEN SOURCE EVIDENCE")}
            <ExternalLink size={14} />
          </a>
        )}
      </section>}

      {skill.skill_page && (
        <section className="drawer-section inspector-note-path">
          <ArchiveSectionTitle asset={cosmosIcons.privateLocal}>{text("知识库记录", "KNOWLEDGE NOTE")}</ArchiveSectionTitle>
          <code data-wrap-kind="path">{skill.skill_page}</code>
        </section>
      )}
      </aside>
    </>
  );
}

function ArchiveSectionTitle({ asset, children }: { asset: string; children: string }) {
  return (
    <h3 className="archive-heading">
      <CosmosAsset className="archive-icon" src={asset} />
      <span>{children}</span>
    </h3>
  );
}

function DetailItem({
  label,
  value,
  code = false,
  wrapKind,
}: {
  label: string;
  value: string;
  code?: boolean;
  wrapKind?: "path";
}) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      {code ? <code>{value}</code> : <strong data-wrap-kind={wrapKind}>{value}</strong>}
    </div>
  );
}

function makeUseCase(skill: SkillRecord, description: string, text: (zh: string, en: string) => string) {
  if (skill.name === "aihot") {
    return text(
      `需要查询中文 AI 热点、模型发布、产品动态或周度资讯时，点名 ${skill.trigger}，并说明时间范围与关注主题。`,
      `Use ${skill.trigger} for Chinese-language AI headlines, model releases, product updates, or weekly news, with a time range and topics of interest.`,
    );
  }
  if (skill.category.includes("浏览器")) {
    return text(
      `当你需要处理“${description}”这类网页或验证任务时，点名 ${skill.trigger}，并给出目标 URL、登录状态和期望证据。`,
      `Use ${skill.trigger} for browser or verification work, and provide the target URL, login state, and expected evidence.`,
    );
  }
  if (skill.category.includes("前端") || skill.category.includes("产品")) {
    return text(`处理界面、交互或产品开发任务时，点名 ${skill.trigger}，并说明目标用户、现有素材、验收标准和视觉约束。`, `Use ${skill.trigger} for interface or product work, with the target user, current materials, acceptance criteria, and visual constraints.`);
  }
  if (skill.category.includes("知识库")) {
    return text(`整理本地知识或 Obsidian 笔记时，点名 ${skill.trigger}，并给出目标范围、保留规则和输出格式。`, `Use ${skill.trigger} for local knowledge or Obsidian work, with the target scope, preservation rules, and output format.`);
  }
  return text(`把任务目标、输入材料、期望格式和完成标准一起交给 ${skill.trigger}。`, `Give ${skill.trigger} the goal, input material, expected format, and completion criteria.`);
}

function makeBoundary(skill: SkillRecord, text: (zh: string, en: string) => string) {
  if (skill.name === "aihot") {
    return text(
      "不适合替代原始来源核验、处理非资讯型任务，或把未经验证的传闻当作确定事实。",
      "Not suitable as a substitute for checking primary sources, for non-news tasks, or for treating unverified reports as confirmed facts.",
    );
  }
  if (skill.category.includes("浏览器")) {
    return text("不适合在缺少目标页面、登录状态或可验证证据要求时直接执行，也不替代最终的人工视觉判断。", "Not suitable without a target page, known login state, or evidence requirements; it also does not replace final human visual judgment.");
  }
  if (skill.category.includes("前端") || skill.category.includes("产品") || skill.category.includes("设计")) {
    return text("不适合在没有视觉目标、用户任务或验收标准时盲目扩张设计，也不自动改变产品的信息架构。", "Not suitable when visual goals, user tasks, or acceptance criteria are missing, and it should not silently change the information architecture.");
  }
  if (skill.category.includes("知识库")) {
    return text("不适合在目标范围、保留规则或资料边界尚未确认时批量改写知识库。", "Not suitable for bulk knowledge-base changes before scope, preservation rules, and data boundaries are confirmed.");
  }
  return text("不适合目标仍然模糊、缺少必要输入，或任务明显超出该 Skill 描述范围的情况。", "Not suitable when the goal is vague, required inputs are missing, or the task clearly exceeds this Skill's documented scope.");
}

function humanizeFrequency(value: number, text: (zh: string, en: string) => string) {
  if (value >= 4) return text("高频", "Frequent");
  if (value >= 2) return text("偶尔使用", "Occasional");
  return text("低频", "Infrequent");
}
