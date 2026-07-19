import { Filter, Search, Sparkles, X } from "lucide-react";
import { categoryGroups, sourceKinds } from "../../data/indexes";
import { useLocale } from "../../i18n/LocaleContext";

const allCategories = "all";
const allSources = "all";

export function CommandDeck({
  query,
  categoryFilter,
  sourceFilter,
  starredOnly,
  resultCount,
  onQueryChange,
  onCategoryChange,
  onSourceChange,
  onStarredChange,
  onReset,
}: {
  query: string;
  categoryFilter: string;
  sourceFilter: string;
  starredOnly: boolean;
  resultCount: number;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onStarredChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const { category: categoryLabel, metadataLabel, text } = useLocale();
  return (
    <section className="command-deck" aria-label={text("搜索和筛选", "Search and filters")}>
      <label className="command-search">
        <Search size={16} />
        <input
          aria-label={text("搜索当前功能区的 Skills", "Search Skills in this functional zone")}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={text("我想做什么？例如：截图验证、HTML、Obsidian、中文润色...", "What do I need? Try: screenshot QA, HTML, Obsidian, writing...")}
        />
      </label>

      <div className="command-filter-row">
        <label>
          <span>{text("分类", "Category")}</span>
          <select value={categoryFilter} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value={allCategories}>{text("全部功能区", "All zones")}</option>
            {categoryGroups.map((category) => (
              <option key={category.category} value={category.category}>
                {categoryLabel(category.category)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{text("来源", "Source")}</span>
          <select value={sourceFilter} onChange={(event) => onSourceChange(event.target.value)}>
            <option value={allSources}>{text("全部来源", "All sources")}</option>
            {sourceKinds.map((kind) => (
              <option key={kind} value={kind}>
                {metadataLabel(kind)}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`toggle-button ${starredOnly ? "active" : ""}`}
          type="button"
          aria-pressed={starredOnly}
          onClick={() => onStarredChange(!starredOnly)}
        >
          <Sparkles size={16} />
          {text("只看高价值", "High value only")}
        </button>

        <button className="ghost-button" type="button" onClick={onReset}>
          <X size={16} />
          {text("清除", "Clear")}
        </button>
      </div>

      <div className="filter-meta" aria-live="polite" aria-atomic="true">
        <Filter size={14} />
        {text(`当前匹配 ${resultCount} 个 Skills`, `${resultCount} matching Skills`)}
      </div>
    </section>
  );
}
