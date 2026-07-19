import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { X } from "lucide-react";
import type { SkillOutcome, SkillRecord } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";

export interface OutcomeComposerInput {
  readonly title: string;
  readonly note?: string;
  readonly artifactRef?: string;
}

interface OutcomeComposerProps {
  readonly skill: SkillRecord;
  readonly existingOutcome?: SkillOutcome;
  readonly returnFocusTo: HTMLElement | null;
  readonly error: string | null;
  readonly onSave: (input: OutcomeComposerInput) => boolean;
  readonly onClose: () => void;
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function OutcomeComposer({
  skill,
  existingOutcome,
  returnFocusTo,
  error,
  onSave,
  onClose,
}: OutcomeComposerProps) {
  const { text } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef(returnFocusTo);
  const titleId = useId();
  const descriptionId = useId();
  const [title, setTitle] = useState(existingOutcome?.title ?? "");
  const [note, setNote] = useState(existingOutcome?.note ?? "");
  const [artifactRef, setArtifactRef] = useState(existingOutcome?.artifactRef ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => titleRef.current?.focus());

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
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function keepFocusInDialog(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setValidationError(text("成果标题不能为空", "Outcome title is required"));
      titleRef.current?.focus();
      return;
    }

    setValidationError(null);
    const saved = onSave({
      title: normalizedTitle,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(artifactRef.trim() ? { artifactRef: artifactRef.trim() } : {}),
    });
    if (!saved) titleRef.current?.focus();
  }

  const visibleError = validationError ?? error;

  return (
    <>
      <div className="outcome-composer-backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="outcome-composer"
        data-surface="outcome-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={keepFocusInDialog}
      >
        <header className="outcome-composer-header">
          <div>
            <span className="pixel-label">{existingOutcome ? "UPDATE OUTCOME" : "RECORD OUTCOME"}</span>
            <h2 id={titleId}>{skill.name}</h2>
          </div>
          <button
            className="icon-button outcome-composer-close"
            type="button"
            onClick={onClose}
            aria-label={text("关闭成果记录", "Close outcome composer")}
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="outcome-composer-body">
            <p id={descriptionId}>
              {text("记录这个 Skill 产生的一项具体成果；编辑同一周期的记录时会保留原完成日期。", "Capture one concrete result from this Skill. Editing this period keeps its original completion date.")}
            </p>

            <label>
              <span>{text("成果标题", "OUTCOME TITLE")}</span>
              <input
                ref={titleRef}
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoComplete="off"
              />
            </label>

            <label>
              <span>{text("备注（可选）", "NOTE (OPTIONAL)")}</span>
              <textarea name="note" value={note} onChange={(event) => setNote(event.target.value)} rows={5} />
            </label>

            <label>
              <span>{text("成果引用（可选）", "ARTIFACT REFERENCE (OPTIONAL)")}</span>
              <input
                name="artifactRef"
                value={artifactRef}
                onChange={(event) => setArtifactRef(event.target.value)}
                autoComplete="off"
              />
            </label>

            {visibleError && <p className="outcome-composer-error" role="alert">{visibleError}</p>}
          </div>

          <footer className="outcome-composer-actions">
            <button className="ghost-button" type="button" onClick={onClose}>{text("取消", "CANCEL")}</button>
            <button className="primary-button" type="submit">{text("保存成果", "SAVE OUTCOME")}</button>
          </footer>
        </form>
      </section>
    </>
  );
}
