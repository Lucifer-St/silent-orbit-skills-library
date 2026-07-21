const state = {
  data: null,
  view: "map",
  query: "",
  category: "",
  source: "",
  skill: "",
  mapFocus: "",
  visibleSkills: [],
  activeIndex: 0,
  viewBox: [0, 0, 1200, 760],
};

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobileViewport = matchMedia("(max-width: 760px)");
const byId = (id) => document.getElementById(id);
const normalized = (value) => String(value ?? "").normalize("NFKC").toLowerCase();
const titleFor = (localized) => localized?.["en-US"] ?? localized?.["zh-CN"] ?? "Skill Library";
const escapeText = (value) => String(value ?? "");

function model() {
  const appData = state.data.appData;
  const categoryBySkill = new Map();
  for (const [category, names] of Object.entries(appData.categorySkillNames ?? {})) for (const name of names) if (!categoryBySkill.has(name)) categoryBySkill.set(name, category);
  const sourceByKey = new Map(appData.libraries.map((source) => [source.key, source]));
  const skills = appData.skills.map((skill) => ({
    ...skill,
    categoryName: categoryBySkill.get(skill.name) ?? skill.category ?? "Uncategorized",
    sourceName: sourceByKey.get(skill.library_key)?.title ?? skill.library_title ?? "Unknown source",
    sourceUrl: sourceByKey.get(skill.library_key)?.source_url ?? skill.repo_url,
  })).sort((left, right) => left.name.localeCompare(right.name, "en"));
  const categories = [...new Set(skills.map((skill) => skill.categoryName))].sort((left, right) => left.localeCompare(right, "en"));
  const sources = [...new Set(skills.map((skill) => skill.sourceName))].sort((left, right) => left.localeCompare(right, "en"));
  return { skills, categories, sources };
}

function filteredSkills() {
  const { skills } = model();
  const query = normalized(state.query);
  return skills.filter((skill) => {
    const matchesQuery = !query || normalized([skill.name, skill.description, skill.trigger, skill.categoryName, skill.sourceName].join(" ")).includes(query);
    return matchesQuery && (!state.category || skill.categoryName === state.category) && (!state.source || skill.sourceName === state.source);
  });
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
  button.innerHTML = `<span>${escapeText(label)}</span><span>${count}</span>`;
  button.addEventListener("click", () => {
    state[kind] = value;
    state.mapFocus = kind === "category" ? value : state.mapFocus;
    hashState();
    render();
  });
  return button;
}

function renderFilters() {
  const { skills, categories, sources } = model();
  const containers = [
    [byId("category-filters"), byId("mobile-category-filters"), categories, "category"],
    [byId("source-filters"), byId("mobile-source-filters"), sources, "source"],
  ];
  for (const [desktop, mobile, values, kind] of containers) {
    for (const container of [desktop, mobile]) {
      container.replaceChildren();
      container.append(filterButton(`All ${kind === "category" ? "Categories" : "Sources"}`, "", kind, skills.length, !state[kind]));
      for (const value of values) container.append(filterButton(value, value, kind, skills.filter((skill) => skill[`${kind}Name`] === value).length, state[kind] === value));
    }
  }
  const count = Number(Boolean(state.category)) + Number(Boolean(state.source));
  byId("mobile-filter-count").textContent = count ? String(count) : "";
}

function openSkill(name, { updateHistory = true } = {}) {
  state.skill = name;
  const skill = model().skills.find((candidate) => candidate.name === name);
  if (skill) {
    state.mapFocus = skill.categoryName;
    if (updateHistory) hashState();
  }
  renderDetail();
  renderMap();
  renderList();
}

function closeDetail({ updateHistory = true } = {}) {
  state.skill = "";
  if (updateHistory) hashState();
  renderDetail();
  renderMap();
  renderList();
}

function renderDetail() {
  const panel = byId("detail-panel");
  const skill = model().skills.find((candidate) => candidate.name === state.skill);
  panel.classList.toggle("is-open", Boolean(skill));
  panel.setAttribute("aria-hidden", skill ? "false" : "true");
  if (!skill) { byId("detail-content").replaceChildren(); return; }
  const content = document.createElement("div");
  const heading = document.createElement("h1");
  heading.textContent = skill.name;
  const description = document.createElement("p");
  description.className = "detail-description";
  description.textContent = skill.description ?? "Public Skill metadata.";
  content.append(heading, description);
  const fields = [
    ["Trigger", skill.trigger ?? `$${skill.name}`],
    ["Category", skill.categoryName],
    ["Source", skill.sourceName],
    ["Publication", skill.visibility],
  ];
  for (const [label, value] of fields) {
    const field = document.createElement("div"); field.className = "detail-field";
    const strong = document.createElement("strong"); strong.textContent = label;
    const span = document.createElement("span"); span.textContent = value ?? "Unknown";
    field.append(strong, span); content.append(field);
  }
  if (skill.sourceUrl) {
    const field = document.createElement("div"); field.className = "detail-field";
    const strong = document.createElement("strong"); strong.textContent = "Public provenance";
    const link = document.createElement("a"); link.href = skill.sourceUrl; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = "Open public source";
    field.append(strong, link); content.append(field);
  }
  byId("detail-content").replaceChildren(content);
}

function renderList() {
  state.visibleSkills = filteredSkills();
  state.activeIndex = Math.min(state.activeIndex, Math.max(0, state.visibleSkills.length - 1));
  byId("list-count").textContent = `${state.visibleSkills.length} Skills`;
  byId("result-count").textContent = `${state.visibleSkills.length} result${state.visibleSkills.length === 1 ? "" : "s"}`;
  const list = byId("skill-list"); list.replaceChildren();
  for (const [index, skill] of state.visibleSkills.entries()) {
    const row = document.createElement("button"); row.type = "button"; row.className = "skill-row";
    row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(state.skill === skill.name)); row.tabIndex = index === state.activeIndex ? 0 : -1;
    const copy = document.createElement("span"); copy.className = "skill-copy";
    const name = document.createElement("strong"); name.textContent = skill.name;
    const description = document.createElement("span"); description.textContent = skill.description ?? "Public Skill metadata.";
    copy.append(name, description);
    const category = document.createElement("span"); category.className = "skill-meta"; category.textContent = skill.categoryName;
    const source = document.createElement("span"); source.className = "skill-meta"; source.textContent = skill.sourceName;
    row.append(copy, category, source);
    row.addEventListener("click", () => { state.activeIndex = index; openSkill(skill.name); });
    list.append(row);
  }
  byId("empty-state").hidden = state.visibleSkills.length > 0;
}

function polar(cx, cy, radius, angle) { return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }; }
function svgElement(name, attributes = {}) { const node = document.createElementNS("http://www.w3.org/2000/svg", name); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); return node; }
function mapCategoryLabel(value) {
  return ({
    "Research & Knowledge": "Research",
    "Software Development": "Development",
    "Data & Analytics": "Data",
    "Creative & Media": "Creative",
    "Documents & Communication": "Documents",
    "Automation & Operations": "Automation",
  })[value] ?? value;
}
function mapSkillLabel(value) { return value.length > 22 ? `${value.slice(0, 21)}…` : value; }

function mapLayout(skills) {
  const categories = [...new Set(skills.map((skill) => skill.categoryName))].sort((left, right) => left.localeCompare(right, "en"));
  const compact = matchMedia("(max-width: 760px)").matches;
  const center = { x: 600, y: 380 };
  const categoryNodes = categories.map((category, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(categories.length, 1));
    const point = polar(center.x, center.y, 238, angle);
    const categorySkills = skills.filter((skill) => skill.categoryName === category);
    const columns = compact ? Math.min(2, Math.max(1, categorySkills.length)) : Math.min(4, Math.max(2, Math.ceil(Math.sqrt(categorySkills.length))));
    const rows = Math.max(1, Math.ceil(categorySkills.length / columns));
    const skillNodes = categorySkills.map((skill, skillIndex) => {
      const column = skillIndex % columns;
      const row = Math.floor(skillIndex / columns);
      return {
        ...skill,
        x: point.x + (column - (columns - 1) / 2) * (compact ? 180 : 190),
        y: point.y + (compact ? 112 : 96) + row * (compact ? 64 : 48),
        categoryPoint: point,
      };
    });
    return {
      category,
      angle,
      ...point,
      skills: skillNodes,
      focusBox: compact
        ? [point.x - 200, point.y - 78, 400, Math.min(640, Math.max(440, 220 + rows * 64))]
        : [point.x - 430, point.y - 82, 860, Math.max(360, 210 + rows * 48)],
    };
  });
  return { center, categoryNodes };
}

function appendText(group, value, x, y, className) { const text = svgElement("text", { x, y, class: className }); text.textContent = value; group.append(text); }

function renderMap() {
  const skills = filteredSkills();
  const compact = matchMedia("(max-width: 760px)").matches;
  const viewport = byId("map-viewport"); viewport.replaceChildren();
  const { center, categoryNodes } = mapLayout(skills);
  const root = svgElement("g", { class: "map-node root-node", role: "button", tabindex: "0", "aria-label": `${skills.length} Skills, return to overview` });
  root.append(svgElement("circle", { cx: center.x, cy: center.y, r: 66 }));
  appendText(root, String(skills.length), center.x, center.y - 4, "root-label"); appendText(root, "Skills", center.x, center.y + 28, "root-sub");
  root.addEventListener("click", focusOverview);
  if (!state.mapFocus) viewport.append(root);
  for (const category of categoryNodes) {
    const categoryActive = state.mapFocus === category.category;
    if (state.mapFocus && !categoryActive) continue;
    const rootEdge = svgElement("line", { x1: center.x, y1: center.y, x2: category.x, y2: category.y, class: `map-edge${state.mapFocus && !categoryActive ? " is-muted" : categoryActive ? " is-active" : ""}` });
    if (!state.mapFocus) viewport.insertBefore(rootEdge, root);
    const group = svgElement("g", { class: `map-node category-node${categoryActive ? " is-active" : ""}`, role: "button", tabindex: "0", "aria-label": `${category.category}, ${category.skills.length} Skills` });
    group.append(svgElement("circle", { cx: category.x, cy: category.y, r: 52 }));
    appendText(group, mapCategoryLabel(category.category), category.x, category.y - 2, "category-label"); appendText(group, `${category.skills.length} skills`, category.x, category.y + 20, "category-count");
    const activateCategory = () => { state.mapFocus = category.category; state.category = ""; hashState(); renderMap(); focusCategory(category); };
    group.addEventListener("click", activateCategory); group.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) activateCategory(); }); viewport.append(group);
    if (!categoryActive) continue;
    for (const skill of category.skills) {
      const active = state.skill === skill.name;
      const nodeHeight = compact ? 56 : 34;
      const edge = svgElement("line", { x1: category.x, y1: category.y + 52, x2: skill.x, y2: skill.y - nodeHeight / 2, class: `map-edge${active ? " is-active" : ""}` });
      viewport.insertBefore(edge, group);
      const visibleLabel = mapSkillLabel(skill.name);
      const width = Math.max(92, Math.min(176, 24 + visibleLabel.length * 6.5));
      const node = svgElement("g", { class: `map-node skill-node${active ? " is-active" : ""}`, role: "button", tabindex: "0", "aria-label": skill.name });
      node.append(svgElement("rect", { x: skill.x - width / 2, y: skill.y - nodeHeight / 2, width, height: nodeHeight })); appendText(node, visibleLabel, skill.x, skill.y + 4, "skill-label");
      const activateSkill = () => { openSkill(skill.name); focusSkill(skill); };
      node.addEventListener("click", activateSkill); node.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) activateSkill(); }); viewport.append(node);
    }
  }
  byId("map-context").textContent = state.mapFocus ? `${state.mapFocus} · ${skills.filter((skill) => skill.categoryName === state.mapFocus).length} Skills` : `${skills.length} reviewed Skills`;
  if (state.mapFocus) {
    const category = categoryNodes.find((candidate) => candidate.category === state.mapFocus);
    if (category) focusCategory(category, false);
  }
}

function animateViewBox(target, animate = true) {
  const svg = byId("skill-map");
  const start = [...state.viewBox]; state.viewBox = target;
  if (!animate || reducedMotion.matches) { svg.setAttribute("viewBox", target.join(" ")); return; }
  const started = performance.now();
  const frame = (time) => {
    const progress = Math.min(1, (time - started) / 280); const eased = 1 - Math.pow(1 - progress, 3);
    const current = start.map((value, index) => value + (target[index] - value) * eased); svg.setAttribute("viewBox", current.join(" "));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function overviewViewBox() { return mobileViewport.matches ? [300, 70, 600, 600] : [0, 0, 1200, 760]; }
function focusOverview() { state.mapFocus = ""; hashState(); renderMap(); animateViewBox(overviewViewBox()); }
function focusCategory(category, animate = true) { animateViewBox(category.focusBox, animate); }
function focusSkill(skill) { animateViewBox([skill.x - 250, skill.y - 185, 500, 370]); }

function render() {
  document.documentElement.dataset.ready = "true";
  byId("app").dataset.view = state.view;
  for (const button of document.querySelectorAll("[data-view-target]")) button.setAttribute("aria-pressed", String(button.dataset.viewTarget === state.view));
  renderFilters(); renderList(); renderMap(); renderDetail();
}

function clearFilters() { state.query = ""; state.category = ""; state.source = ""; state.mapFocus = ""; byId("search").value = ""; hashState(); render(); }

function bindEvents() {
  byId("search").addEventListener("input", (event) => { state.query = event.target.value; state.activeIndex = 0; hashState({ replace: true }); render(); });
  byId("search").addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.skill) { event.preventDefault(); event.stopPropagation(); closeDetail(); return; }
    if (event.key === "Enter" && state.visibleSkills[0]) { openSkill(state.visibleSkills[0].name); state.mapFocus = state.visibleSkills[0].categoryName; render(); }
  });
  for (const button of document.querySelectorAll("[data-view-target]")) button.addEventListener("click", () => { state.view = button.dataset.viewTarget; hashState(); render(); });
  byId("clear-filters").addEventListener("click", clearFilters); byId("mobile-clear-filters").addEventListener("click", clearFilters);
  byId("mobile-filter-button").addEventListener("click", () => byId("mobile-filters").showModal());
  byId("detail-close").addEventListener("click", () => closeDetail()); byId("detail-back").addEventListener("click", () => closeDetail());
  byId("map-overview").addEventListener("click", focusOverview);
  for (const button of document.querySelectorAll("[data-zoom]")) button.addEventListener("click", () => {
    if (button.dataset.zoom === "reset") { focusOverview(); return; }
    const factor = button.dataset.zoom === "in" ? .8 : 1.25; const [x, y, width, height] = state.viewBox;
    const nextWidth = Math.max(320, Math.min(1500, width * factor)); const nextHeight = nextWidth * height / width;
    animateViewBox([x + (width - nextWidth) / 2, y + (height - nextHeight) / 2, nextWidth, nextHeight]);
  });
  let drag;
  byId("map-stage").addEventListener("pointerdown", (event) => { if (event.target.closest(".map-node, button")) return; drag = { x: event.clientX, y: event.clientY, viewBox: [...state.viewBox] }; event.currentTarget.setPointerCapture(event.pointerId); });
  byId("map-stage").addEventListener("pointermove", (event) => { if (!drag) return; const [, , width, height] = drag.viewBox; const box = event.currentTarget.getBoundingClientRect(); const dx = (event.clientX - drag.x) * width / box.width; const dy = (event.clientY - drag.y) * height / box.height; animateViewBox([drag.viewBox[0] - dx, drag.viewBox[1] - dy, width, height], false); });
  byId("map-stage").addEventListener("pointerup", () => { drag = undefined; });
  addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== byId("search")) { event.preventDefault(); byId("search").focus(); }
    if (event.key === "Escape") { if (state.skill) closeDetail(); else if (state.mapFocus) focusOverview(); }
    if (["ArrowDown", "ArrowUp"].includes(event.key) && state.view === "library" && state.visibleSkills.length) {
      event.preventDefault(); state.activeIndex = (state.activeIndex + (event.key === "ArrowDown" ? 1 : -1) + state.visibleSkills.length) % state.visibleSkills.length;
      document.querySelectorAll(".skill-row")[state.activeIndex]?.focus();
    }
    if (event.key === "Enter" && state.view === "library" && document.activeElement?.classList.contains("skill-row")) openSkill(state.visibleSkills[state.activeIndex].name);
  });
  addEventListener("popstate", () => { restoreHash(); render(); });
  addEventListener("resize", () => {
    if (!state.mapFocus && !state.skill) animateViewBox(overviewViewBox(), false);
  });
}

async function start() {
  const response = await fetch("./site-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`site-data.json returned ${response.status}`);
  state.data = await response.json();
  byId("project-title").textContent = titleFor(state.data.project.title);
  document.title = `${titleFor(state.data.project.title)} · Reference Preview`;
  restoreHash(); state.viewBox = overviewViewBox(); bindEvents(); render();
  if (state.skill) openSkill(state.skill, { updateHistory: false });
}

start().catch((error) => {
  document.body.innerHTML = `<main class="empty-state"><strong>Unable to load the Skill library.</strong><span>${escapeText(error.message)}</span></main>`;
});
