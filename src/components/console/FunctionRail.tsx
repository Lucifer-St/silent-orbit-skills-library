import type { CategoryGroup, PageKey } from "../../types";
import { useLocale } from "../../i18n/LocaleContext";

export interface FunctionRailProps {
  page: PageKey;
  activeCategory: string;
  categories: readonly CategoryGroup[];
  onCategory: (category: string) => void;
}

export function FunctionRail({ page, activeCategory, categories, onCategory }: FunctionRailProps) {
  const { category: categoryLabel, text } = useLocale();
  return (
    <aside className="function-rail" aria-label={text("功能分类", "Functional zones")} data-rail-page={page}>
      <span className="console-kicker">FUNCTION INDEX</span>
      {categories.map((category, index) => {
        const active = page === "category" && activeCategory === category.category;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className="function-rail-item"
            data-active={active}
            data-category-id={`category:${category.category}`}
            key={category.category}
            type="button"
            onClick={() => onCategory(category.category)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{categoryLabel(category.category)}</strong>
            <small>{category.skill_count}</small>
          </button>
        );
      })}
    </aside>
  );
}
