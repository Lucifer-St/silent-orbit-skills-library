import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LibraryRecord, Locale, SkillRecord, SkillOrigin, SkillVisibility } from "../types";

const localeStorageKey = "skills-library-locale-v1";

export const categoryEnglish = new Map<string, string>([
  ["个人知识库与本地工具", "Personal Knowledge & Local Tools"],
  ["产品与前端开发", "Product & Frontend Development"],
  ["协作平台与发布", "Collaboration & Publishing"],
  ["工程质量与安全", "Engineering Quality & Security"],
  ["效率与元工作流", "Productivity & Meta Workflows"],
  ["数据分析与研究", "Data Analysis & Research"],
  ["文档与办公", "Documents & Office"],
  ["浏览器与自动化", "Browser & Automation"],
  ["设计与创意生产", "Design & Creative Production"],
]);

interface LocaleContextValue {
  readonly locale: Locale;
  readonly isEnglish: boolean;
  readonly setLocale: (locale: Locale) => void;
  readonly toggleLocale: () => void;
  readonly text: (zh: string, en: string) => string;
  readonly category: (value: string) => string;
  readonly skillDescription: (skill: SkillRecord) => string;
  readonly libraryTitle: (library: Pick<LibraryRecord, "key" | "title"> | undefined, fallback?: string) => string;
  readonly libraryDescription: (library: LibraryRecord | undefined, fallback?: string) => string;
  readonly installStatus: (status: SkillRecord["status"]) => string;
  readonly metadataLabel: (value: string | undefined, fallback?: string) => string;
  readonly origin: (value: SkillOrigin) => string;
  readonly visibility: (value: SkillVisibility) => string;
}

const fallbackLocaleContext: LocaleContextValue = {
  locale: "zh-CN",
  isEnglish: false,
  setLocale: () => undefined,
  toggleLocale: () => undefined,
  text: (zh) => zh,
  category: (value) => value,
  skillDescription: (skill) => skill.description_i18n?.["zh-CN"] ?? skill.description,
  libraryTitle: (library, fallback = "") => library?.title ?? fallback,
  libraryDescription: (library, fallback = "") => library?.description ?? fallback,
  installStatus: (status) => localizedInstallStatus(status, "zh-CN"),
  metadataLabel: (value, fallback = "") => localizedMetadataLabel(value, "zh-CN", fallback),
  origin: (origin) => ({
    "third-party": "第三方",
    creator: "作者自建",
    system: "系统内置",
    unknown: "待确认",
  })[origin],
  visibility: (visibility) => ({
    public: "公开",
    "creator-showcase": "作者展示",
    "local-only": "仅本地",
  })[visibility],
};

const LocaleContext = createContext<LocaleContextValue>(fallbackLocaleContext);

function initialLocale(): Locale {
  const saved = window.localStorage.getItem(localeStorageKey);
  return saved === "en-US" ? "en-US" : "zh-CN";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const isEnglish = locale === "en-US";
    const text = (zh: string, en: string) => (isEnglish ? en : zh);
    return {
      locale,
      isEnglish,
      setLocale,
      toggleLocale: () => setLocale((current) => current === "zh-CN" ? "en-US" : "zh-CN"),
      text,
      category: (value) => isEnglish ? categoryEnglish.get(value) ?? value : value,
      skillDescription: (skill) => {
        const localized = skill.description_i18n?.[locale];
        if (localized) return localized;
        if (!isEnglish) return skill.description;
        const category = categoryEnglish.get(skill.category) ?? skill.category;
        return `Use ${skill.name} for ${category.toLowerCase()} tasks when its documented capability matches the goal.`;
      },
      libraryTitle: (library, fallback = "") => {
        if (!library) return isEnglish && fallback === "个人常用" ? "Personal Deck" : fallback;
        if (!isEnglish) return library.title;
        if (library.key === "personal:deck") return "Personal Deck";
        return library.title;
      },
      libraryDescription: (library, fallback = "") => {
        if (!library) return fallback;
        if (!isEnglish) return library.description ?? fallback;
        if (library.key === "personal:deck") {
          return "A curated mix of creator-built and third-party Skills. Origin and visibility are recorded independently.";
        }
        return `${library.title} groups ${library.skills.length} related Skills under one shared capability boundary.`;
      },
      installStatus: (status) => localizedInstallStatus(status, locale),
      metadataLabel: (metadata, fallback = "") => localizedMetadataLabel(metadata, locale, fallback),
      origin: (origin) => ({
        "third-party": text("第三方", "Third-party"),
        creator: text("作者自建", "Creator-built"),
        system: text("系统内置", "System"),
        unknown: text("待确认", "Unknown"),
      })[origin],
      visibility: (visibility) => ({
        public: text("公开", "Public"),
        "creator-showcase": text("作者展示", "Creator showcase"),
        "local-only": text("仅本地", "Local only"),
      })[visibility],
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function localizedInstallStatus(status: SkillRecord["status"], locale: Locale) {
  const labels: Record<string, readonly [zh: string, en: string]> = {
    installed: ["已安装", "Installed"],
    "全局已安装": ["已安装", "Installed"],
    available: ["可使用", "Available"],
    "启用插件提供": ["启用插件提供", "Provided by enabled plugin"],
    "插件缓存/会话可用": ["插件缓存/会话可用", "Available in plugin cache/session"],
    "系统内置": ["系统内置", "Built in"],
  };
  if (!status) return locale === "en-US" ? "Not recorded" : "未记录";
  const label = labels[status];
  if (!label) return status;
  return locale === "en-US" ? label[1] : label[0];
}

export function localizedMetadataLabel(value: string | undefined, locale: Locale, fallback = "") {
  if (!value) return fallback;
  const labels: Record<string, readonly [zh: string, en: string]> = {
    "单独 skill": ["单独 Skill", "Standalone Skill"],
    "插件包": ["插件包", "Plugin Package"],
    "本地库": ["本地库", "Local Library"],
    "系统库": ["系统库", "System Library"],
    "GitHub repo": ["GitHub repo", "GitHub Repo"],
    "个人精选": ["个人精选", "Personal Curation"],
    "插件": ["插件", "Plugin"],
    "本地": ["本地", "Local"],
    "系统": ["系统", "System"],
    "个人工作流精选": ["个人工作流精选", "Curated Workflow"],
    library: ["能力库", "Library"],
    skill: ["单独 Skill", "Standalone Skill"],
  };
  const label = labels[value];
  if (!label) return value;
  return locale === "en-US" ? label[1] : label[0];
}
