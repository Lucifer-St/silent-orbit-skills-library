const SVG_NS = "http://www.w3.org/2000/svg";
const LOCALE_STORAGE_KEY = "silent-orbit-reference-locale-v1";
const messages = {
  "zh-CN": {
    editionLabel: "参考预览 / Phase 1E",
    atlasTitle: "Skill 图书馆",
    atlasView: "图书馆视图",
    map: "地图",
    library: "目录",
    switchLanguage: "切换为英文",
    searchSkills: "搜索 Skills",
    search: "搜索",
    searchPlaceholder: "名称、说明、分类或来源",
    filters: "筛选",
    taxonomyMap: "Skill 分类地图",
    taxonomySpread: "分类总览",
    backOverview: "返回总览",
    organizedSkills: "按分类章节组织的 Skills",
    zoomControls: "地图缩放控件",
    zoomIn: "放大",
    zoomOut: "缩小",
    reset: "重置",
    mapInstruction: "拖动平移 · 使用按钮缩放 · 选择一个分类进入",
    skillIndex: "Skill 目录",
    indexFilters: "目录筛选",
    refineEdition: "缩小范围",
    clear: "清除",
    categories: "分类",
    sources: "来源",
    libraryIndex: "图书馆目录",
    reviewedSkills: "已审阅 Skills",
    alphabeticalEdition: "按名称排序",
    skills: "Skills",
    noResults: "没有结果",
    noMatchingSkills: "没有匹配的 Skills",
    emptyHint: "清除筛选，或换一个关键词。",
    skillArticle: "Skill 详情",
    back: "← 返回",
    close: "关闭",
    closeDetail: "关闭详情",
    applyFilters: "应用筛选",
    allCategories: "全部分类",
    uncategorized: "未分类",
    unknownSource: "未知来源",
    creatorShowcase: "作者展示",
    public: "公开",
    noDescription: "未提供公开说明。",
    notSupplied: "未提供",
    trigger: "触发方式",
    category: "分类",
    source: "来源",
    publication: "公开范围",
    reviewedMetadata: "这里只展示经过审阅的公开元数据 · 已安装 Skill 的完整说明不在本图书馆内",
    matchingSkills: "个匹配 Skills",
    inChapter: "个 Skills",
    moreInChapter: "个更多 Skills",
    noMatchingMap: "没有匹配的 Skills",
    reopenChapter: "清除筛选或搜索词，重新打开这个分类。",
    loadFailure: "无法载入 Skill 图书馆。",
  },
  "en-US": {
    editionLabel: "Reference Preview / Phase 1E",
    atlasTitle: "Editorial Skill Atlas",
    atlasView: "Atlas view",
    map: "Map",
    library: "Library",
    switchLanguage: "Switch to Chinese",
    searchSkills: "Search Skills",
    search: "Search",
    searchPlaceholder: "Name, description, category, source",
    filters: "Filters",
    taxonomyMap: "Editorial taxonomy map",
    taxonomySpread: "Taxonomy spread",
    backOverview: "Back to overview",
    organizedSkills: "Skills organized as editorial category chapters",
    zoomControls: "Map zoom controls",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Reset",
    mapInstruction: "Drag to pan · use controls to zoom · select a chapter to enter",
    skillIndex: "Editorial Skill index",
    indexFilters: "Index filters",
    refineEdition: "Refine the edition",
    clear: "Clear",
    categories: "Categories",
    sources: "Sources",
    libraryIndex: "Library index",
    reviewedSkills: "Reviewed Skills",
    alphabeticalEdition: "Alphabetical edition",
    skills: "Skills",
    noResults: "No results",
    noMatchingSkills: "No matching Skills",
    emptyHint: "Clear a filter or try another search.",
    skillArticle: "Skill article",
    back: "← Back",
    close: "Close",
    closeDetail: "Close detail",
    applyFilters: "Apply filters",
    allCategories: "All Categories",
    uncategorized: "Uncategorized",
    unknownSource: "Unknown source",
    creatorShowcase: "Creator showcase",
    public: "Public",
    noDescription: "No public description supplied.",
    notSupplied: "Not supplied",
    trigger: "Trigger",
    category: "Category",
    source: "Source",
    publication: "Publication",
    reviewedMetadata: "Reviewed public metadata · installed Skill instructions remain outside this Atlas",
    matchingSkills: "matching Skills",
    inChapter: "Skills",
    moreInChapter: "more in this chapter",
    noMatchingMap: "No matching Skills",
    reopenChapter: "Clear a filter or search phrase to reopen this chapter.",
    loadFailure: "Unable to load the Skill library.",
  },
};
const categoryTranslations = {
  "Content & Communication": "内容与沟通",
  "Documents & Communication": "文档与沟通",
  "Data & Analytics": "数据与分析",
  "Development & Delivery": "开发与交付",
  "Software Development": "软件开发",
  "Knowledge & Research": "知识与研究",
  "Research & Knowledge": "研究与知识",
  "Creative & Media": "创意与媒体",
  "Automation & Operations": "自动化与运营",
  "Productivity & Operations": "效率与运营",
  "Review Required": "需要人工复核",
};

const state = {
  data: null,
  locale: "zh-CN",
  supportedLocales: ["zh-CN", "en-US"],
  view: "map",
  query: "",
  category: "",
  source: "",
  skill: "",
  mapFocus: "",
  visibleSkills: [],
  activeIndex: 0,
  viewBox: [0, 0, 1200, 800],
  mapNodes: new Map(),
  previousFocus: null,
};

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobileViewport = matchMedia("(max-width: 760px)");
const byId = (id) => document.getElementById(id);
const normalized = (value) => String(value ?? "").normalize("NFKC").toLowerCase();
const t = (key) => messages[state.locale]?.[key] ?? messages["en-US"][key] ?? key;
const titleFor = (localized) => localized?.[state.locale] ?? localized?.["zh-CN"] ?? localized?.["en-US"] ?? "Skill Library";
const categoryFor = (category) => state.locale === "zh-CN" ? categoryTranslations[category] ?? category : category;
const descriptionFor = (skill) => skill.description_i18n?.[state.locale]
  ?? skill.description_i18n?.["zh-CN"]
  ?? skill.description_i18n?.["en-US"]
  ?? skill.description
  ?? t("noDescription");

function applyLocale() {
  document.documentElement.lang = state.locale;
  document.documentElement.dataset.locale = state.locale;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
  const localeToggle = byId("locale-toggle");
  if (localeToggle) {
    localeToggle.hidden = state.supportedLocales.length < 2;
    localeToggle.textContent = state.locale === "zh-CN" ? "EN" : "中";
  }
}

function resolveLocale() {
  const configured = Array.isArray(state.data?.project?.locales)
    ? state.data.project.locales.filter((locale) => messages[locale])
    : [];
  state.supportedLocales = configured.length ? configured : ["zh-CN", "en-US"];
  let saved;
  try {
    saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    saved = null;
  }
  const browserLocale = navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  state.locale = [saved, state.data?.project?.defaultLocale, browserLocale, "zh-CN", "en-US"]
    .find((locale) => state.supportedLocales.includes(locale)) ?? state.supportedLocales[0];
}

function toggleLocale() {
  const currentIndex = state.supportedLocales.indexOf(state.locale);
  state.locale = state.supportedLocales[(currentIndex + 1) % state.supportedLocales.length];
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, state.locale);
  } catch {
    // The interface still switches for this session when browser storage is unavailable.
  }
  applyLocale();
  render();
  updateProjectIdentity();
}

function updateProjectIdentity() {
  const projectTitle = titleFor(state.data.project.title);
  const skillCount = model().skills.length;
  byId("project-title").textContent = state.locale === "zh-CN"
    ? `${projectTitle} · ${skillCount} 个已审阅 Skills`
    : `${projectTitle} · ${skillCount} reviewed Skills`;
  document.title = state.locale === "zh-CN"
    ? `Skill 图书馆 · ${projectTitle}`
    : `Editorial Skill Atlas · ${projectTitle}`;
}

function model() {
  const appData = state.data.appData;
  const categoryBySkill = new Map();
  for (const [category, names] of Object.entries(appData.categorySkillNames ?? {})) {
    for (const name of names) if (!categoryBySkill.has(name)) categoryBySkill.set(name, category);
  }
  const sourceByKey = new Map(appData.libraries.map((source) => [source.key, source]));
  const skills = appData.skills.map((skill) => ({
    ...skill,
    categoryName: categoryBySkill.get(skill.name) ?? skill.category ?? "Uncategorized",
    sourceName: sourceByKey.get(skill.library_key)?.title ?? skill.library_title ?? t("unknownSource"),
    sourceUrl: sourceByKey.get(skill.library_key)?.source_url ?? skill.repo_url,
    publication: skill.visibility === "creator-showcase" ? "creatorShowcase" : "public",
  })).sort((left, right) => left.name.localeCompare(right.name, state.locale));
  const categories = [...new Set(skills.map((skill) => skill.categoryName))].sort((left, right) => categoryFor(left).localeCompare(categoryFor(right), state.locale));
  const sources = [...new Set(skills.map((skill) => skill.sourceName))].sort((left, right) => left.localeCompare(right, state.locale));
  return { skills, categories, sources };
}

function matchesQuery(skill) {
  const query = normalized(state.query);
  return !query || normalized([
    skill.name,
    skill.description,
    skill.description_i18n?.["zh-CN"],
    skill.description_i18n?.["en-US"],
    skill.trigger,
    skill.categoryName,
    categoryFor(skill.categoryName),
    skill.sourceName,
  ].join(" ")).includes(query);
}

function filteredSkills({ ignoreCategory = false, ignoreSource = false } = {}) {
  return model().skills.filter((skill) => matchesQuery(skill)
    && (ignoreCategory || !state.category || skill.categoryName === state.category)
    && (ignoreSource || !state.source || skill.sourceName === state.source));
}

function hashState({ replace = false } = {}) {
  const params = new URLSearchParams();
  if (state.view !== "map") params.set("view", state.view);
  if (state.query) params.set("q", state.query);
  if (state.category) params.set("category", state.category);
  if (state.source) params.set("source", state.source);
  if (state.skill) params.set("skill", state.skill);
  if (state.mapFocus) params.set("focus", state.mapFocus);
  const next = `${location.pathname}${location.search}${params.size ? `#${params}` : ""}`;
  history[replace ? "replaceState" : "pushState"]({}, "", next);
}

function restoreHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.view = params.get("view") === "library" ? "library" : "map";
  state.query = params.get("q") ?? "";
  state.category = params.get("category") ?? "";
  state.source = params.get("source") ?? "";
  state.skill = params.get("skill") ?? "";
  state.mapFocus = params.get("focus") ?? "";
  byId("search").value = state.query;
}

function filterButton(label, value, kind, count, active) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `filter-option${active ? " is-active" : ""}`;
  button.dataset.filterKind = kind;
  button.dataset.filterValue = value;
  button.setAttribute("aria-pressed", String(active));
  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("span");
  amount.className = "filter-count";
  amount.textContent = String(count);
  button.append(name, amount);
  button.addEventListener("click", () => {
    state[kind] = active ? "" : value;
    state.activeIndex = 0;
    if (kind === "category") state.mapFocus = state[kind];
    hashState();
    render();
    requestAnimationFrame(() => animateViewBox(state.mapFocus ? focusOverviewViewBox() : overviewViewBox()));
  });
  return button;
}

function renderFilters() {
  const { skills, categories, sources } = model();
  const categoryTargets = [byId("category-filters"), byId("mobile-category-filters")];
  const sourceTargets = [byId("source-filters"), byId("mobile-source-filters")];
  categoryTargets.forEach((target) => { target.replaceChildren(); });
  sourceTargets.forEach((target) => { target.replaceChildren(); });
  for (const category of categories) {
    const count = skills.filter((skill) => matchesQuery(skill)
      && (!state.source || skill.sourceName === state.source)
      && skill.categoryName === category).length;
    categoryTargets.forEach((target) => target.append(filterButton(categoryFor(category), category, "category", count, state.category === category)));
  }
  for (const source of sources) {
    const count = skills.filter((skill) => matchesQuery(skill)
      && (!state.category || skill.categoryName === state.category)
      && skill.sourceName === source).length;
    sourceTargets.forEach((target) => target.append(filterButton(source, source, "source", count, state.source === source)));
  }
  const activeFilters = Number(Boolean(state.category)) + Number(Boolean(state.source));
  byId("mobile-filter-count").textContent = activeFilters ? `(${activeFilters})` : "";
}

function renderList() {
  const skills = filteredSkills();
  state.visibleSkills = skills;
  if (state.activeIndex >= skills.length) state.activeIndex = Math.max(0, skills.length - 1);
  byId("result-count").textContent = `${skills.length} / ${model().skills.length}`;
  byId("list-count").textContent = state.locale === "zh-CN"
    ? `${skills.length} 个 Skills`
    : `${skills.length} ${skills.length === 1 ? "Skill" : "Skills"}`;
  byId("empty-state").hidden = skills.length > 0;
  const list = byId("skill-list");
  list.replaceChildren();
  skills.forEach((skill, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "skill-row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(state.skill === skill.name));
    row.dataset.skill = skill.name;

    const copy = document.createElement("span");
    copy.className = "skill-copy";
    const name = document.createElement("strong");
    name.textContent = skill.name;
    const description = document.createElement("span");
    description.textContent = descriptionFor(skill);
    copy.append(name, description);

    const meta = document.createElement("span");
    meta.className = "skill-meta";
    const category = document.createElement("span");
    category.textContent = categoryFor(skill.categoryName);
    const source = document.createElement("span");
    source.textContent = skill.sourceName;
    meta.append(category, source);

    row.append(copy, meta);
    row.addEventListener("focus", () => { state.activeIndex = index; });
    row.addEventListener("click", () => openSkill(skill.name));
    list.append(row);
  });
}

function detailField(label, value, href) {
  const field = document.createElement("div");
  field.className = "detail-field";
  const title = document.createElement("strong");
  title.textContent = label;
  const content = href ? document.createElement("a") : document.createElement("span");
  content.textContent = value || t("notSupplied");
  if (href) {
    content.href = href;
    content.target = "_blank";
    content.rel = "noreferrer";
  }
  field.append(title, content);
  return field;
}

function renderDetail() {
  const panel = byId("detail-panel");
  const skill = model().skills.find((entry) => entry.name === state.skill);
  panel.classList.toggle("is-open", Boolean(skill));
  panel.setAttribute("aria-hidden", String(!skill));
  byId("app").dataset.detailOpen = String(Boolean(skill));
  const content = byId("detail-content");
  content.replaceChildren();
  if (!skill) return;

  const article = document.createElement("article");
  const kicker = document.createElement("div");
  kicker.className = "detail-kicker section-label";
  kicker.textContent = t("skillArticle");
  const title = document.createElement("h1");
  title.textContent = skill.name;
  const description = document.createElement("p");
  description.className = "detail-description";
  description.textContent = descriptionFor(skill);
  article.append(
    kicker,
    title,
    description,
    detailField(t("trigger"), skill.trigger),
    detailField(t("category"), categoryFor(skill.categoryName)),
    detailField(t("source"), skill.sourceName, skill.sourceUrl),
    detailField(t("publication"), t(skill.publication)),
  );
  const footer = document.createElement("p");
  footer.className = "detail-footer";
  footer.textContent = t("reviewedMetadata");
  article.append(footer);
  content.append(article);
}

function openSkill(name, { updateHistory = true } = {}) {
  const skill = model().skills.find((entry) => entry.name === name);
  if (!skill) return;
  state.previousFocus = document.activeElement;
  state.skill = skill.name;
  if (state.view === "map") state.mapFocus = skill.categoryName;
  if (updateHistory) hashState();
  render();
  requestAnimationFrame(() => {
    if (state.view === "map") focusSkill(skill.name);
    if (mobileViewport.matches) byId("detail-close").focus();
  });
}

function closeDetail({ updateHistory = true } = {}) {
  state.skill = "";
  if (updateHistory) hashState();
  renderDetail();
  renderList();
  renderMap();
  requestAnimationFrame(() => {
    if (state.view === "map") animateViewBox(state.mapFocus ? focusOverviewViewBox() : overviewViewBox());
    if (state.previousFocus instanceof HTMLElement && state.previousFocus.isConnected) state.previousFocus.focus();
  });
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function svgText(parent, text, x, y, className, attributes = {}) {
  const element = svgElement("text", { x, y, class: className, ...attributes });
  element.textContent = text;
  parent.append(element);
  return element;
}

function wrappedLines(value, maximumCharacters) {
  const input = String(value ?? "").trim();
  if (!input) return [""];
  const lines = [];
  let rest = input;
  while (rest.length > maximumCharacters) {
    const window = rest.slice(0, maximumCharacters + 1);
    const breakAt = Math.max(window.lastIndexOf("-"), window.lastIndexOf("_"), window.lastIndexOf(" "));
    const index = breakAt > Math.floor(maximumCharacters * .45) ? breakAt + 1 : maximumCharacters;
    lines.push(rest.slice(0, index).trim());
    rest = rest.slice(index).trim();
  }
  if (rest) lines.push(rest);
  return lines;
}

function wrappedSvgText(parent, value, { x, y, maximumCharacters, lineHeight, className }) {
  const text = svgElement("text", { x, y, class: className });
  wrappedLines(value, maximumCharacters).forEach((line, index) => {
    const span = svgElement("tspan", { x, dy: index === 0 ? 0 : lineHeight });
    span.textContent = line;
    text.append(span);
  });
  parent.append(text);
  return text;
}

function activateMapNode(group, callback) {
  group.addEventListener("click", callback);
  group.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      callback();
    }
  });
}

function overviewGeometry() {
  if (mobileViewport.matches) {
    return {
      width: 390,
      height: 1050,
      cards: Array.from({ length: 5 }, (_, index) => ({ x: 24, y: 26 + index * 205, width: 342, height: 164 })),
      edges: [
        "M 90 190 L 90 215 L 300 215 L 300 231",
        "M 300 395 L 300 420 L 110 420 L 110 436",
        "M 110 600 L 110 625 L 286 625 L 286 641",
        "M 286 805 L 286 830 L 128 830 L 128 846",
      ],
    };
  }
  return {
    width: 1200,
    height: 800,
    cards: [
      { x: 58, y: 54, width: 430, height: 214 },
      { x: 712, y: 54, width: 430, height: 214 },
      { x: 385, y: 304, width: 430, height: 214 },
      { x: 58, y: 555, width: 430, height: 188 },
      { x: 712, y: 555, width: 430, height: 188 },
    ],
    edges: [
      "M 488 224 L 556 224 L 556 350 L 385 350",
      "M 712 224 L 644 224 L 644 382 L 815 382",
      "M 430 518 L 430 538 L 310 538 L 310 555",
      "M 770 518 L 770 538 L 890 538 L 890 555",
    ],
  };
}

function renderOverview(viewport) {
  const geometry = overviewGeometry();
  const { categories } = model();
  const visible = filteredSkills();
  geometry.edges.slice(0, Math.max(0, categories.length - 1)).forEach((pathValue) => {
    viewport.append(svgElement("path", { d: pathValue, class: "taxonomy-edge" }));
  });

  categories.forEach((category, index) => {
    const card = geometry.cards[index] ?? geometry.cards.at(-1);
    const skills = visible.filter((skill) => skill.categoryName === category);
    const group = svgElement("g", {
      class: `map-node category-spread${skills.length ? "" : " is-empty"}`,
      tabindex: "0",
      role: "treeitem",
      "aria-label": state.locale === "zh-CN"
        ? `${categoryFor(category)}，${skills.length} 个匹配 Skills`
        : `${category}, ${skills.length} matching Skills`,
      transform: `translate(${card.x} ${card.y})`,
    });
    group.append(svgElement("rect", { class: "chapter-hit", width: card.width, height: card.height }));
    svgText(group, `0${index + 1}`, 0, 18, "chapter-number");
    svgText(group, state.locale === "zh-CN" ? `${skills.length} 个 Skills` : `${skills.length} Skills`, card.width, 18, "chapter-count", { "text-anchor": "end" });
    wrappedSvgText(group, categoryFor(category), {
      x: 0,
      y: 62,
      maximumCharacters: mobileViewport.matches ? 26 : 34,
      lineHeight: 32,
      className: "chapter-title",
    });
    group.append(svgElement("line", { x1: 0, y1: 103, x2: card.width, y2: 103, class: "chapter-rule" }));
    const samples = skills.slice(0, 2);
    let sampleY = 128;
    samples.forEach((skill) => {
      wrappedSvgText(group, skill.name, {
        x: 0,
        y: sampleY,
        maximumCharacters: mobileViewport.matches ? 39 : 52,
        lineHeight: 15,
        className: "chapter-sample",
      });
      sampleY += wrappedLines(skill.name, mobileViewport.matches ? 39 : 52).length * 15 + 7;
    });
    if (skills.length > samples.length) {
      const remaining = skills.length - samples.length;
      svgText(
        group,
        state.locale === "zh-CN" ? `+ 本分类还有 ${remaining} 个` : `+ ${remaining} more in this chapter`,
        card.width,
        card.height - 4,
        "chapter-more",
        { "text-anchor": "end" },
      );
    }
    activateMapNode(group, () => enterCategory(category));
    viewport.append(group);
  });
  byId("map-context").textContent = state.locale === "zh-CN"
    ? `${t("allCategories")} · ${visible.length} 个已审阅 Skills`
    : `${t("allCategories")} · ${visible.length} reviewed Skills`;
}

function renderCategory(viewport, category) {
  const skills = filteredSkills().filter((skill) => skill.categoryName === category);
  const mobile = mobileViewport.matches;
  const width = mobile ? 390 : 1200;
  const columns = mobile ? 1 : 3;
  const columnWidth = mobile ? 350 : 350;
  const gap = mobile ? 0 : 30;
  const startX = mobile ? 20 : 45;
  const startY = mobile ? 166 : 168;
  const rowHeight = mobile ? 116 : 104;
  const nodeHeight = mobile ? 98 : 86;
  const rows = Math.max(1, Math.ceil(skills.length / columns));
  const worldHeight = Math.max(mobile ? 1000 : 800, startY + rows * rowHeight + 70);

  viewport.append(svgElement("rect", { x: 20, y: 26, width: width - 40, height: 106, class: "focus-band" }));
  wrappedSvgText(viewport, categoryFor(category), {
    x: 42,
    y: 78,
    maximumCharacters: mobile ? 22 : 42,
    lineHeight: 38,
    className: "focus-title",
  });
  svgText(
    viewport,
    state.locale === "zh-CN" ? `${skills.length} 个匹配 Skills` : `${skills.length} matching Skills`,
    width - 42,
    108,
    "focus-count",
    { "text-anchor": "end" },
  );

  if (!skills.length) {
    svgText(viewport, t("noMatchingMap"), 42, 230, "map-empty-title");
    svgText(viewport, t("reopenChapter"), 42, 268, "map-empty-copy");
    byId("map-context").textContent = state.locale === "zh-CN"
      ? `${categoryFor(category)} · 0 个匹配 Skills`
      : `${category} · 0 matching Skills`;
    return { worldHeight };
  }

  for (let column = 0; column < columns; column += 1) {
    const x = startX + column * (columnWidth + gap);
    viewport.append(svgElement("line", { x1: x, y1: startY - 10, x2: x, y2: worldHeight - 42, class: "column-rule" }));
  }

  skills.forEach((skill, index) => {
    const column = mobile ? 0 : index % columns;
    const row = mobile ? index : Math.floor(index / columns);
    const x = startX + column * (columnWidth + gap);
    const y = startY + row * rowHeight;
    const active = state.skill === skill.name;
    const group = svgElement("g", {
      class: `map-node map-skill-node${active ? " is-active" : ""}`,
      tabindex: "0",
      role: "treeitem",
      "aria-selected": String(active),
      "aria-label": `${skill.name}. ${categoryFor(skill.categoryName)}. ${t(skill.publication)}.`,
      transform: `translate(${x} ${y})`,
    });
    group.append(svgElement("rect", { class: "skill-hit", width: columnWidth, height: nodeHeight }));
    wrappedSvgText(group, skill.name, {
      x: 16,
      y: 26,
      maximumCharacters: mobile ? 33 : 36,
      lineHeight: 18,
      className: "map-skill-title",
    });
    svgText(group, t(skill.publication), 16, nodeHeight - 13, "skill-publication");
    activateMapNode(group, () => openSkill(skill.name));
    viewport.append(group);
    state.mapNodes.set(skill.name, { x, y, width: columnWidth, height: nodeHeight });
  });
  byId("map-context").textContent = state.locale === "zh-CN"
    ? `${categoryFor(category)} · ${skills.length} 个匹配 Skills`
    : `${category} · ${skills.length} matching Skills`;
  return { worldHeight };
}

function renderMap() {
  const viewport = byId("map-viewport");
  viewport.replaceChildren();
  state.mapNodes = new Map();
  const validFocus = model().categories.includes(state.mapFocus) ? state.mapFocus : "";
  if (state.mapFocus && !validFocus) state.mapFocus = "";
  if (validFocus) renderCategory(viewport, validFocus);
  else renderOverview(viewport);
  byId("map-overview").hidden = !validFocus;
  byId("skill-map").setAttribute("viewBox", state.viewBox.join(" "));
}

function animateViewBox(target, animate = true) {
  const svg = byId("skill-map");
  const start = [...state.viewBox];
  state.viewBox = [...target];
  if (!animate || reducedMotion.matches) {
    svg.setAttribute("viewBox", target.join(" "));
    return;
  }
  const started = performance.now();
  const frame = (time) => {
    const progress = Math.min(1, (time - started) / 160);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start.map((value, index) => value + (target[index] - value) * eased);
    svg.setAttribute("viewBox", current.join(" "));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function overviewViewBox() { return mobileViewport.matches ? [0, 0, 390, 1050] : [0, 0, 1200, 800]; }
function focusOverviewViewBox() { return mobileViewport.matches ? [0, 0, 390, 1000] : [0, 0, 1200, 800]; }

function enterCategory(category) {
  state.mapFocus = category;
  state.skill = "";
  hashState();
  render();
  requestAnimationFrame(() => animateViewBox(focusOverviewViewBox()));
}

function focusOverview() {
  state.mapFocus = "";
  state.skill = "";
  hashState();
  render();
  requestAnimationFrame(() => animateViewBox(overviewViewBox()));
}

function focusSkill(name) {
  const node = state.mapNodes.get(name);
  if (!node) return;
  if (mobileViewport.matches) {
    animateViewBox([0, Math.max(0, node.y - 170), 390, 620]);
    return;
  }
  animateViewBox([
    Math.max(0, node.x - 175),
    Math.max(0, node.y - 185),
    720,
    480,
  ]);
}

function render() {
  document.documentElement.dataset.ready = "true";
  applyLocale();
  byId("app").dataset.view = state.view;
  for (const button of document.querySelectorAll("[data-view-target]")) {
    button.setAttribute("aria-pressed", String(button.dataset.viewTarget === state.view));
  }
  renderFilters();
  renderList();
  renderMap();
  renderDetail();
}

function clearFilters() {
  state.query = "";
  state.category = "";
  state.source = "";
  state.mapFocus = "";
  byId("search").value = "";
  hashState();
  render();
  requestAnimationFrame(() => animateViewBox(overviewViewBox()));
}

function switchView(view) {
  state.view = view;
  if (view === "map" && state.category) state.mapFocus = state.category;
  hashState();
  render();
  if (view === "map") requestAnimationFrame(() => {
    if (state.skill) focusSkill(state.skill);
    else animateViewBox(state.mapFocus ? focusOverviewViewBox() : overviewViewBox());
  });
}

function bindEvents() {
  byId("search").addEventListener("input", (event) => {
    state.query = event.target.value;
    state.activeIndex = 0;
    hashState({ replace: true });
    render();
  });
  byId("search").addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.skill) {
      event.preventDefault();
      event.stopPropagation();
      closeDetail();
      return;
    }
    if (event.key === "Enter" && state.visibleSkills[0]) openSkill(state.visibleSkills[0].name);
  });
  for (const button of document.querySelectorAll("[data-view-target]")) {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget));
  }
  byId("locale-toggle").addEventListener("click", toggleLocale);
  byId("clear-filters").addEventListener("click", clearFilters);
  byId("mobile-clear-filters").addEventListener("click", clearFilters);
  byId("mobile-filter-button").addEventListener("click", () => byId("mobile-filters").showModal());
  byId("detail-close").addEventListener("click", () => closeDetail());
  byId("detail-back").addEventListener("click", () => closeDetail());
  byId("map-overview").addEventListener("click", focusOverview);

  for (const button of document.querySelectorAll("[data-zoom]")) {
    button.addEventListener("click", () => {
      if (button.dataset.zoom === "reset") {
        animateViewBox(state.mapFocus ? focusOverviewViewBox() : overviewViewBox());
        return;
      }
      const factor = button.dataset.zoom === "in" ? .82 : 1.22;
      const [x, y, width, height] = state.viewBox;
      const minimum = mobileViewport.matches ? 260 : 420;
      const maximum = mobileViewport.matches ? 1200 : 1600;
      const nextWidth = Math.max(minimum, Math.min(maximum, width * factor));
      const nextHeight = nextWidth * height / width;
      animateViewBox([x + (width - nextWidth) / 2, y + (height - nextHeight) / 2, nextWidth, nextHeight]);
    });
  }

  let drag;
  byId("map-stage").addEventListener("pointerdown", (event) => {
    if (event.target.closest(".map-node, button")) return;
    drag = { x: event.clientX, y: event.clientY, viewBox: [...state.viewBox] };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  byId("map-stage").addEventListener("pointermove", (event) => {
    if (!drag) return;
    const [, , width, height] = drag.viewBox;
    const box = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.x) * width / box.width;
    const dy = (event.clientY - drag.y) * height / box.height;
    animateViewBox([drag.viewBox[0] - dx, drag.viewBox[1] - dy, width, height], false);
  });
  const endDrag = () => { drag = undefined; };
  byId("map-stage").addEventListener("pointerup", endDrag);
  byId("map-stage").addEventListener("pointercancel", endDrag);

  addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== byId("search")) {
      event.preventDefault();
      if (mobileViewport.matches && state.view === "map") switchView("library");
      requestAnimationFrame(() => byId("search").focus());
    }
    if (event.key === "Escape") {
      if (state.skill) closeDetail();
      else if (state.mapFocus) focusOverview();
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key) && state.view === "library" && state.visibleSkills.length && document.activeElement !== byId("search")) {
      event.preventDefault();
      state.activeIndex = (state.activeIndex + (event.key === "ArrowDown" ? 1 : -1) + state.visibleSkills.length) % state.visibleSkills.length;
      document.querySelectorAll(".skill-row")[state.activeIndex]?.focus();
    }
  });

  addEventListener("popstate", () => {
    restoreHash();
    render();
    requestAnimationFrame(() => {
      if (state.view !== "map") return;
      if (state.skill) focusSkill(state.skill);
      else animateViewBox(state.mapFocus ? focusOverviewViewBox() : overviewViewBox(), false);
    });
  });

  let wasMobile = mobileViewport.matches;
  addEventListener("resize", () => {
    if (wasMobile === mobileViewport.matches) return;
    wasMobile = mobileViewport.matches;
    state.viewBox = state.mapFocus ? focusOverviewViewBox() : overviewViewBox();
    renderMap();
    if (state.skill) requestAnimationFrame(() => focusSkill(state.skill));
  });
}

async function start() {
  const response = await fetch("./site-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`site-data.json returned ${response.status}`);
  state.data = await response.json();
  resolveLocale();
  applyLocale();
  updateProjectIdentity();
  restoreHash();
  state.viewBox = state.mapFocus ? focusOverviewViewBox() : overviewViewBox();
  bindEvents();
  render();
  if (state.skill) requestAnimationFrame(() => focusSkill(state.skill));
}

start().catch((error) => {
  const message = document.createElement("main");
  message.className = "empty-state";
  const title = document.createElement("strong");
  title.textContent = t("loadFailure");
  const detail = document.createElement("span");
  detail.textContent = error.message;
  message.append(title, detail);
  document.body.replaceChildren(message);
});
