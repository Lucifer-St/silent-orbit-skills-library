import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const activeIndex = Math.max(0, categories.findIndex((category) => category.category === activeCategory));
  const currentCategory = categories[activeIndex] ?? categories[0];
  const itemListId = `function-rail-items-${page}`;

  return (
    <aside
      className="function-rail"
      aria-label={text("功能分类", "Functional zones")}
      data-mobile-expanded={mobileExpanded}
      data-rail-page={page}
    >
      <span className="console-kicker">{text("功能索引", "FUNCTION INDEX")}</span>
      {currentCategory ? (
        <button
          aria-controls={itemListId}
          aria-expanded={mobileExpanded}
          className="function-rail-toggle"
          type="button"
          onClick={() => setMobileExpanded((expanded) => !expanded)}
        >
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <strong>{categoryLabel(currentCategory.category)}</strong>
          <small>{text(`${currentCategory.skill_count} 个 Skills`, `${currentCategory.skill_count} SKILLS`)}</small>
          <ChevronDown aria-hidden="true" size={14} strokeWidth={1.4} />
        </button>
      ) : null}
      <div className="function-rail-items" id={itemListId}>
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
              onClick={() => {
                setMobileExpanded(false);
                onCategory(category.category);
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{categoryLabel(category.category)}</strong>
              <small>{category.skill_count}</small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
