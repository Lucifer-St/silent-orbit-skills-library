import type { FormEvent } from "react";
import { Search } from "lucide-react";
import { useLocale } from "../../i18n/LocaleContext";

export interface LibrarianSearchProps {
  draft: string;
  submittedQuery: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}

export function LibrarianSearch({ draft, submittedQuery, onDraftChange, onSubmit, onClear }: LibrarianSearchProps) {
  const { text } = useLocale();
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="librarian-search-shell" aria-labelledby="librarian-prompt">
      <p className="librarian-motto">ASK. DISCOVER. ACT.</p>
      <form className="librarian-search" role="search" onSubmit={handleSubmit}>
        <label className="librarian-search-label" id="librarian-prompt" htmlFor="librarian-query">
          {text("你想完成什么？", "WHAT DO YOU NEED?")}
        </label>
        <div className="librarian-search-row">
          <Search aria-hidden="true" size={15} strokeWidth={1.4} />
          <input
            id="librarian-query"
            type="search"
            autoComplete="off"
            value={draft}
            placeholder={text("描述你的目标…", "WHAT DO YOU NEED?")}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <button className="librarian-submit" type="submit">
            {text("检索", "ENTER")}
          </button>
        </div>
      </form>
      <div className="librarian-search-foot">
        <span>{text("自然语言检索", "NATURAL LANGUAGE SEARCH")}</span>
        {(draft || submittedQuery) && (
          <button className="librarian-clear" type="button" onClick={onClear}>
            {text("[ 清除 ]", "[ CLEAR ]")}
          </button>
        )}
      </div>
    </section>
  );
}
