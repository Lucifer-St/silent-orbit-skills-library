import { useMemo, useState } from "react";
import { cosmosIcons, historyEmptyAsset } from "../../lib/cosmosAssets";
import type { PersonalDataV1, SkillOutcome } from "../../types";
import { CosmosAsset } from "../CosmosAsset";
import { useLocale } from "../../i18n/LocaleContext";

interface HistoryPageProps {
  readonly data: PersonalDataV1;
  readonly error: string | null;
  readonly onDelete: (id: string) => boolean;
  readonly onExport: () => string;
  readonly onImport: (json: string) => boolean;
}

function compareNewestFirst(left: SkillOutcome, right: SkillOutcome): number {
  const leftTime = Date.parse(left.completedAt);
  const rightTime = Date.parse(right.completedAt);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.id.localeCompare(right.id);
}

export function HistoryPage({ data, error, onDelete, onExport, onImport }: HistoryPageProps) {
  const { locale, text } = useLocale();
  const [transferJson, setTransferJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const outcomes = useMemo(() => [...data.outcomes].sort(compareNewestFirst), [data.outcomes]);

  function exportPersonalData() {
    const json = onExport();
    if (!json) {
      setImportError(text("无法导出个人数据", "Personal data could not be exported"));
      return;
    }
    setTransferJson(json);
    setImportError(null);
  }

  function importPersonalData() {
    if (!transferJson.trim()) {
      setImportError(text("请先粘贴个人数据 JSON", "Paste personal data JSON before importing"));
      return;
    }

    const imported = onImport(transferJson);
    setImportError(imported ? null : text("导入被拒绝，原有个人数据已保留。", "Import rejected. Existing personal data was kept."));
  }

  function confirmDelete(id: string) {
    if (onDelete(id)) setPendingDeleteId(null);
  }

  return (
    <div className="page-stack history-page" data-page="history">
      <section className="page-header history-header">
        <span className="pixel-label">HISTORY</span>
        <h1>{text("使用轨迹", "Usage History")}</h1>
        <p>{text("你主动记录的 Skill 成果。按时间倒序排列，并且只保存在当前浏览器中。", "Skill outcomes you chose to record, newest first and stored only in this browser.")}</p>
      </section>

      <section className="outcome-history" aria-labelledby="outcome-history-title">
        <div className="history-list-heading">
          <span className="pixel-label archive-heading" id="outcome-history-title">
            <CosmosAsset className="archive-icon" src={cosmosIcons.recordedOutcome} />
            <span>RECORDED OUTCOMES</span>
          </span>
          <span>{outcomes.length}</span>
        </div>
        {outcomes.length === 0 ? (
          <div className="history-empty">
            <CosmosAsset className="history-empty-asset" src={historyEmptyAsset} />
            <strong>{text("还没有留下使用轨迹", "No outcomes recorded yet")}</strong>
            <p>{text("从任意 Skill Detail 里选择 RECORD OUTCOME，记录一次真实产出。", "Choose RECORD OUTCOME from any Skill Detail to capture a real result.")}</p>
          </div>
        ) : (
          <div className="outcome-history-list">
            {outcomes.map((outcome) => (
              <article
                className="outcome-history-item"
                data-outcome-id={outcome.id}
                data-completed-at={outcome.completedAt}
                key={outcome.id}
              >
                <div className="outcome-history-meta">
                  <span className="archive-heading">
                    <CosmosAsset className="archive-icon" src={cosmosIcons.recordedOutcome} />
                    <span>{outcome.skillId}</span>
                  </span>
                  <time dateTime={outcome.completedAt}>{new Date(outcome.completedAt).toLocaleString(locale)}</time>
                </div>
                <h2>{outcome.title}</h2>
                {outcome.note && <p className="outcome-note">{outcome.note}</p>}
                {outcome.artifactRef && <code data-wrap-kind="path">{outcome.artifactRef}</code>}
                {pendingDeleteId === outcome.id ? (
                  <div
                    className="outcome-delete-confirm"
                    role="group"
                    aria-label={text(`确认删除 ${outcome.title}`, `Confirm deletion of ${outcome.title}`)}
                  >
                    <span>{text("删除这条成果？", "Delete this outcome?")}</span>
                    <button
                      className="ghost-button outcome-delete-cancel"
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      autoFocus
                    >
                      {text("保留", "KEEP")}
                    </button>
                    <button
                      className="primary-button outcome-delete-confirm-button"
                      type="button"
                      onClick={() => confirmDelete(outcome.id)}
                    >
                      {text("确认删除", "CONFIRM DELETE")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="ghost-button outcome-delete"
                    type="button"
                    onClick={() => setPendingDeleteId(outcome.id)}
                    aria-label={text(`删除 ${outcome.title}`, `Delete ${outcome.title}`)}
                  >
                    {text("删除", "DELETE")}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="history-transfer">
        <summary>
          <span>
            <span className="pixel-label archive-heading" id="personal-data-transfer-title">
              <CosmosAsset className="archive-icon" src={cosmosIcons.privateLocal} />
              <span>ADVANCED DATA</span>
            </span>
            <strong>{text("导入与导出个人数据", "Import and export personal data")}</strong>
          </span>
          <small>JSON / LOCAL ONLY</small>
        </summary>
        <div className="history-transfer-body" aria-labelledby="personal-data-transfer-title">
          <p>{text("仅在迁移或备份时使用。导入会以完整 JSON 数据替换当前个人记录。", "Use only for migration or backup. Import replaces the current personal records with the complete JSON payload.")}</p>
          <textarea
            className="personal-data-transfer"
            value={transferJson}
            onChange={(event) => setTransferJson(event.target.value)}
            aria-label="Personal data JSON"
            spellCheck={false}
            rows={7}
          />
          <div className="history-transfer-actions">
            <button className="ghost-button outcome-export" type="button" onClick={exportPersonalData}>
              <CosmosAsset className="archive-button-icon" src={cosmosIcons.exportData} />
              {text("导出个人数据", "EXPORT PERSONAL DATA")}
            </button>
            <button className="primary-button outcome-import" type="button" onClick={importPersonalData}>
              <CosmosAsset className="archive-button-icon" src={cosmosIcons.importData} />
              {text("导入个人数据", "IMPORT PERSONAL DATA")}
            </button>
          </div>
          {importError && <p className="history-import-error" role="alert">{importError}</p>}
          {!importError && error && <p className="history-storage-error" role="alert">{error}</p>}
        </div>
      </details>
    </div>
  );
}
