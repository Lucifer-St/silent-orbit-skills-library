const state = { data: null, query: "", category: "all", source: "all" };
const byId = (id) => document.getElementById(id);
const text = (value) => String(value ?? "");

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function skillMatches(skill) {
  const query = state.query.toLowerCase();
  const haystack = [skill.name, skill.description, skill.trigger, skill.library_title].map(text).join(" ").toLowerCase();
  return (!query || haystack.includes(query))
    && (state.category === "all" || skill.category === state.category)
    && (state.source === "all" || skill.library_key === state.source);
}

function openSkill(skill) {
  byId("dialog-source").textContent = skill.library_title;
  byId("dialog-title").textContent = skill.name;
  byId("dialog-description").textContent = skill.description;
  const meta = byId("dialog-meta");
  meta.replaceChildren();
  for (const [label, value] of [["Trigger", skill.trigger], ["System", skill.category], ["Origin", skill.origin], ["Visibility", skill.visibility]]) {
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.textContent = text(value);
    meta.append(term, detail);
  }
  byId("skill-dialog").showModal();
}

function renderSkills() {
  const skills = state.data.appData.skills.filter(skillMatches);
  byId("result-count").textContent = `${skills.length} / ${state.data.appData.skills.length}`;
  byId("empty").hidden = skills.length > 0;
  const grid = byId("skills");
  grid.replaceChildren();
  skills.forEach((skill, index) => {
    const card = document.createElement("button");
    card.type = "button"; card.className = "skill";
    const number = document.createElement("span"); number.className = "index"; number.textContent = String(index + 1).padStart(3, "0");
    const title = document.createElement("h3"); title.textContent = skill.name;
    const description = document.createElement("p"); description.textContent = skill.description;
    const source = document.createElement("small"); source.textContent = `${skill.category} / ${skill.library_title}`;
    card.append(number, title, description, source);
    card.addEventListener("click", () => openSkill(skill));
    grid.append(card);
  });
}

function renderSystems() {
  const root = byId("systems"); root.replaceChildren();
  state.data.appData.categoryUnits.forEach((category) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "system";
    const name = document.createElement("b"); name.textContent = category.category;
    const count = document.createElement("span"); count.textContent = `${category.skill_count} SKILLS / ${category.units.length} SOURCES`;
    button.append(name, count);
    button.addEventListener("click", () => { state.category = category.category; byId("category").value = category.category; renderSkills(); byId("catalog-title").scrollIntoView({ behavior: "smooth" }); });
    root.append(button);
  });
}

function renderMetrics() {
  const summary = state.data.siteManifest.summary;
  const values = [[summary.skills, "SKILLS"], [summary.libraries, "SOURCES"], [summary.categories, "SYSTEMS"], [summary.collections, "COLLECTIONS"]];
  const root = byId("metrics"); root.replaceChildren();
  values.forEach(([value, label]) => { const metric = document.createElement("div"); metric.className = "metric"; const strong = document.createElement("strong"); strong.textContent = text(value); const span = document.createElement("span"); span.textContent = label; metric.append(strong, span); root.append(metric); });
}

async function start() {
  const response = await fetch("./site-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`site-data.json returned ${response.status}`);
  state.data = await response.json();
  const title = state.data.project.title[state.data.project.defaultLocale] ?? state.data.project.title["en-US"] ?? "Skill Library";
  document.title = `${title} · Silent Orbit`;
  byId("project-title").textContent = title.toUpperCase();
  byId("status").textContent = `${state.data.siteManifest.summary.categories} SYSTEMS / ${state.data.siteManifest.summary.skills} SKILLS`;
  byId("snapshot").textContent = `SNAPSHOT ${state.data.siteManifest.generatedAt}`;
  state.data.appData.categoryUnits.forEach((category) => byId("category").append(option(category.category, category.category)));
  state.data.appData.libraries.forEach((library) => byId("source").append(option(library.key, library.title)));
  renderMetrics(); renderSystems(); renderSkills();
}

byId("search").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderSkills(); });
byId("category").addEventListener("change", (event) => { state.category = event.target.value; renderSkills(); });
byId("source").addEventListener("change", (event) => { state.source = event.target.value; renderSkills(); });
byId("skill-dialog").querySelector(".close").addEventListener("click", () => byId("skill-dialog").close());
byId("skill-dialog").addEventListener("click", (event) => { if (event.target === byId("skill-dialog")) byId("skill-dialog").close(); });

start().catch((error) => { byId("status").textContent = "LOAD FAILED"; byId("empty").hidden = false; byId("empty").textContent = error.message; });
