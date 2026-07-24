#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createTrustedSourceBatchPlanV1,
  executeTrustedSourceBatchV1,
} from "../../../work/agent-os-index/scripts/lib/trusted-source-maintenance.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptDir);
const defaultRepoRoot = path.resolve(skillDir, "../..");
const markerPrefix = "skills-library-maintenance";
const defaultConfigPath = path.join(os.homedir(), ".codex", "skills-library-maintenance.json");

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[index + 1];
    const value = !next || next.startsWith("--") ? true : tokens[++index];
    if (Object.hasOwn(options, key)) {
      options[key] = Array.isArray(options[key]) ? [...options[key], value] : [options[key], value];
    } else {
      options[key] = value;
    }
  }
  return { command, options, positional };
}

function isLibraryRepo(candidate) {
  return Boolean(candidate
    && fs.existsSync(path.join(candidate, "outputs", "data", "skills.json"))
    && fs.existsSync(path.join(candidate, "work", "agent-os-index", "package.json")));
}

function findLibraryRepo(start) {
  let current = path.resolve(start);
  while (true) {
    if (isLibraryRepo(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function resolveConfig(options = {}) {
  const userHome = os.homedir();
  const configPath = path.resolve(String(options["config"] ?? process.env.SKILLS_LIBRARY_CONFIG ?? defaultConfigPath));
  const stored = readJson(configPath, {});
  const explicitRepoRoot = options["repo-root"] ?? process.env.SKILLS_LIBRARY_REPO_ROOT;
  const repoCandidate = explicitRepoRoot
    ?? findLibraryRepo(process.cwd())
    ?? stored.repoRoot
    ?? (isLibraryRepo(defaultRepoRoot) ? defaultRepoRoot : undefined);
  if (!repoCandidate) {
    throw new Error(`Skills Library repository is not configured. Run configure --repo-root <path>; config file: ${configPath}`);
  }
  const repoRoot = path.resolve(String(repoCandidate));
  if (!isLibraryRepo(repoRoot)) throw new Error(`Configured Skills Library repository is invalid: ${repoRoot}`);
  return {
    configPath,
    repoRoot,
    privateRoot: path.resolve(String(options["private-root"] ?? process.env.SKILLS_LIBRARY_PRIVATE_ROOT ?? stored.privateRoot ?? path.join(repoRoot, ".skills-library-maintenance"))),
    vaultRoot: path.resolve(String(options["vault-root"] ?? process.env.SKILLS_LIBRARY_VAULT_ROOT ?? stored.vaultRoot ?? path.join(userHome, "Documents", "Obsidian Vault", "30 Resources", "Codex Skill Library"))),
    sessionsRoot: path.resolve(String(options["sessions-root"] ?? process.env.SKILLS_LIBRARY_SESSIONS_ROOT ?? stored.sessionsRoot ?? path.join(userHome, ".codex", "sessions"))),
    now: new Date(String(options.now ?? new Date().toISOString())),
    liveJson: options["live-json"] ? path.resolve(String(options["live-json"])) : undefined,
    pluginText: options["plugin-text"] ? path.resolve(String(options["plugin-text"])) : undefined,
    mcpText: options["mcp-text"] ? path.resolve(String(options["mcp-text"])) : undefined,
  };
}

function configure(config) {
  const record = {
    schemaVersion: 1,
    repoRoot: config.repoRoot,
    privateRoot: config.privateRoot,
    vaultRoot: config.vaultRoot,
    sessionsRoot: config.sessionsRoot,
  };
  writeJsonAtomic(config.configPath, record);
  return { configured: true, configPath: config.configPath, ...record };
}

function ensureInside(parent, target, label) {
  const root = path.resolve(parent);
  const candidate = path.resolve(target);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes its allowed root: ${candidate}`);
  }
  return candidate;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function commandInvocation(name, args) {
  if (process.platform === "win32" && (name === "npx" || name === "npm")) {
    const cliName = name === "npx" ? "npx-cli.js" : "npm-cli.js";
    const cliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", cliName);
    if (fs.existsSync(cliPath)) return { command: process.execPath, args: [cliPath, ...args] };
  }
  return { command: name, args };
}

function run(command, args, { allowFailure = false, cwd = defaultRepoRoot } = {}) {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  const status = result.status ?? 1;
  if (result.error && !allowFailure) {
    throw new Error(`${command} ${args.join(" ")} could not start: ${result.error.message}`);
  }
  if (!allowFailure && status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${status}): ${result.stderr || result.stdout || result.error?.message || "no output"}`);
  }
  return { status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function parseFrontmatter(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split("\n");
  const result = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, raw] = field;
    if (raw === "|" || raw === ">") {
      const block = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) block.push(lines[++index].trim());
      result[key] = block.join(" ").trim();
    } else {
      result[key] = raw.replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return result;
}

function readPluginManifest(skillPath) {
  for (const relative of [path.join(".claude-plugin", "plugin.json"), "plugin.json"]) {
    const candidate = path.join(skillPath, relative);
    if (!fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function inspectLiveSkill(entry) {
  const skillPath = path.resolve(entry.path);
  const skillFile = path.join(skillPath, "SKILL.md");
  const source = fs.existsSync(skillFile) ? fs.readFileSync(skillFile, "utf8") : "";
  const metadata = parseFrontmatter(source);
  const manifest = readPluginManifest(skillPath);
  return {
    name: String(entry.name),
    path: skillPath,
    scope: entry.scope ?? "global",
    agents: Array.isArray(entry.agents) ? entry.agents : [],
    description: String(metadata.description ?? manifest?.description ?? "").trim(),
    version: String(metadata.version ?? manifest?.version ?? "").trim() || null,
    author: manifest?.author?.name ?? null,
    sourceUrl: manifest?.repository ?? manifest?.homepage ?? null,
    skillFileExists: Boolean(source),
    skillFileSha256: source ? sha256(source) : null,
  };
}

function loadLiveEntries(config) {
  if (config.liveJson) return readJson(config.liveJson, []);
  const result = run("npx", ["skills", "list", "-g", "-a", "codex", "--json"], { cwd: config.repoRoot });
  return JSON.parse(result.stdout);
}

function loadTextFixtureOrCommand(fixture, command, args, config) {
  if (fixture) return fs.readFileSync(fixture, "utf8");
  const result = run(command, args, { allowFailure: true, cwd: config.repoRoot });
  return `${result.stdout}${result.stderr}`;
}

export function scanInventory(config, { write = true } = {}) {
  const globalSkills = loadLiveEntries(config).map(inspectLiveSkill).sort((left, right) => left.name.localeCompare(right.name));
  const snapshot = {
    schemaVersion: 1,
    capturedAt: config.now.toISOString(),
    globalSkills,
    pluginOutput: loadTextFixtureOrCommand(config.pluginText, "codex", ["plugin", "list"], config),
    mcpOutput: loadTextFixtureOrCommand(config.mcpText, "codex", ["mcp", "list"], config),
    counts: { globalSkills: globalSkills.length },
  };
  if (write) {
    const snapshotDir = ensureInside(config.privateRoot, path.join(config.privateRoot, "snapshots"), "snapshot directory");
    const datedPath = path.join(snapshotDir, `inventory-${config.now.toISOString().replace(/[:.]/g, "-")}.json`);
    writeJsonAtomic(datedPath, snapshot);
    writeJsonAtomic(path.join(snapshotDir, "inventory-latest.json"), snapshot);
  }
  return snapshot;
}

function loadPublicSkills(config) {
  return readJson(path.join(config.repoRoot, "outputs", "data", "skills.json"), []);
}

function privateCatalogPath(config) {
  return path.join(config.privateRoot, "catalog", "private-skills.json");
}

function lifecycleEventId(skill, type, at, suffix = "") {
  const timestamp = String(at).replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
  return `${skill}-${timestamp}-${type}${suffix ? `-${suffix}` : ""}`;
}

function loadPrivateCatalog(config) {
  const catalog = readJson(privateCatalogPath(config), { schemaVersion: 1, skills: [], events: [] });
  return {
    ...catalog,
    skills: Array.isArray(catalog.skills) ? catalog.skills : [],
    events: (Array.isArray(catalog.events) ? catalog.events : []).map((event, index) => ({
      ...event,
      id: event.id ?? lifecycleEventId(event.skill ?? "unknown", event.type ?? "event", event.at ?? "unknown", String(index + 1)),
    })),
  };
}

function appendPrivateEvent(catalog, { at, type, skill, summary }) {
  const baseId = lifecycleEventId(skill, type, at);
  let id = baseId;
  let suffix = 2;
  const ids = new Set(catalog.events.map((event) => event.id));
  while (ids.has(id)) id = `${baseId}-${suffix++}`;
  catalog.events.push({ id, at, type, skill, summary });
}

function inferCategory(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  if (/pet|sprite|image|visual|design|mascot|art/.test(text)) return "设计与创意生产";
  if (/writing|text|humaniz|document|copy|prose|markdown/.test(text)) return "文档与办公";
  if (/obsidian|knowledge|note|vault/.test(text)) return "个人知识库与本地工具";
  if (/browser|chrome|automation/.test(text)) return "浏览器与自动化";
  if (/data|research|notebook|analysis/.test(text)) return "数据分析与研究";
  if (/security|test|quality|debug/.test(text)) return "工程质量与安全";
  if (/frontend|code|web app|react/.test(text)) return "产品与前端开发";
  return "效率与元工作流";
}

function inferOrigin(skill) {
  if (skill.sourceUrl || skill.author) return "third-party";
  return "unknown";
}

function draftManagedRecord(skill, capturedAt, visibility = "public") {
  const date = capturedAt.slice(0, 10);
  const isLocalOnly = visibility === "local-only";
  return {
    name: skill.name,
    description: skill.description || `本地已安装 Skill：${skill.name}。`,
    trigger: `$${skill.name}`,
    category: inferCategory(skill.name, skill.description),
    library_key: isLocalOnly ? `local:${skill.name}` : "local:global",
    library_title: isLocalOnly ? (skill.sourceUrl ? new URL(skill.sourceUrl).pathname.replace(/^\//, "") : skill.name) : "global",
    library_page: isLocalOnly ? undefined : "Libraries/global.md",
    status: "全局已安装",
    origin: inferOrigin(skill),
    visibility,
    state: "active",
    addedAt: date,
    removedAt: null,
    sourceUrl: skill.sourceUrl,
    author: skill.author,
    version: skill.version,
    installedPath: skill.path,
    skillFileSha256: skill.skillFileSha256,
  };
}

export function buildPlanFromInventory({ inventory, publicSkills, privateCatalog, localOnly = [] }) {
  const localOnlyNames = new Set([localOnly].flat().filter((value) => typeof value === "string"));
  const allAdditionsLocalOnly = [localOnly].flat().includes(true);
  const publicGlobal = publicSkills.filter((skill) => skill.status === "全局已安装");
  const privateActive = privateCatalog.skills.filter((skill) => skill.state === "active");
  const privateRetired = new Map(privateCatalog.skills.filter((skill) => skill.state === "retired").map((skill) => [skill.name, skill]));
  const known = new Map([...publicGlobal, ...privateActive].map((skill) => [skill.name, skill]));
  const live = new Map(inventory.globalSkills.map((skill) => [skill.name, skill]));
  const additions = [...live.values()].filter((skill) => !known.has(skill.name)).map((skill) => {
    const visibility = allAdditionsLocalOnly || localOnlyNames.has(skill.name) ? "local-only" : "public";
    const draft = draftManagedRecord(skill, inventory.capturedAt, visibility);
    const retired = privateRetired.get(skill.name);
    if (!retired) return draft;
    return {
      ...draft,
      category: retired.category ?? draft.category,
      library_key: retired.library_key ?? draft.library_key,
      library_title: retired.library_title ?? draft.library_title,
      origin: retired.origin ?? draft.origin,
      addedAt: retired.addedAt ?? draft.addedAt,
      previousVisibility: retired.previousVisibility ?? retired.visibility ?? "local-only",
      visibility,
      library_key: visibility === "local-only" ? (retired.library_key ?? draft.library_key) : "local:global",
      library_title: visibility === "local-only" ? (retired.library_title ?? draft.library_title) : "global",
      library_page: visibility === "local-only" ? retired.library_page : "Libraries/global.md",
      reactivation: true,
    };
  });
  const removals = [...known.values()].filter((skill) => !live.has(skill.name)).map((skill) => ({
    name: skill.name,
    previousVisibility: skill.visibility,
    sourceUrl: skill.sourceUrl ?? skill.repo_url ?? null,
    requiresConfirmation: true,
  }));
  const changed = [];
  for (const skill of privateActive) {
    const current = live.get(skill.name);
    if (current?.skillFileSha256 && skill.skillFileSha256 && current.skillFileSha256 !== skill.skillFileSha256) {
      changed.push({
        name: skill.name,
        beforeSha256: skill.skillFileSha256,
        afterSha256: current.skillFileSha256,
        versionBefore: skill.version ?? null,
        versionAfter: current.version ?? null,
      });
    }
  }
  return {
    schemaVersion: 1,
    createdAt: inventory.capturedAt,
    additions,
    removals,
    changed,
    unchangedCount: [...live.keys()].filter((name) => known.has(name) && !changed.some((item) => item.name === name)).length,
    requiresConfirmation: removals.length > 0,
  };
}

function uniqueLifecycleId(changes, baseId) {
  const ids = new Set(changes.map((change) => change.id));
  if (!ids.has(baseId)) return baseId;
  let suffix = 2;
  while (ids.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

export function retirePublicDataset(dataset, skillName, at) {
  const retiredSkill = dataset.skills.find((skill) => skill.name === skillName);
  if (!retiredSkill) return { dataset, retiredSkill: null, lifecycleEvent: null };

  const date = String(at).slice(0, 10);
  const baseId = lifecycleEventId(skillName, "removed", at);
  const lifecycleEvent = {
    id: uniqueLifecycleId(dataset.changes, baseId),
    date,
    type: "removed",
    skill: skillName,
    visibility: retiredSkill.visibility ?? "public",
    title: `Removed ${skillName} from active Skills`,
    summary: `${skillName} was removed from the active global Skill surface after explicit confirmation; its lifecycle record remains available.`,
    title_i18n: {
      "zh-CN": `${skillName} 已从活动 Skills 移除`,
      "en-US": `Removed ${skillName} from active Skills`,
    },
    summary_i18n: {
      "zh-CN": `${skillName} 经明确确认后从活动全局 Skill 表面移除；生命周期记录继续保留。`,
      "en-US": `${skillName} was removed from the active global Skill surface after explicit confirmation; its lifecycle record remains available.`,
    },
  };

  const categoryUnits = dataset.categoryUnits.map((group) => {
    const units = group.units
      .map((unit) => {
        const skills = unit.skills.filter((name) => name !== skillName);
        return { ...unit, skills, skill_count: new Set(skills).size };
      })
      .filter((unit) => unit.skills.length > 0);
    return { ...group, units, skill_count: new Set(units.flatMap((unit) => unit.skills)).size };
  });

  return {
    retiredSkill,
    lifecycleEvent,
    dataset: {
      ...dataset,
      skills: dataset.skills.filter((skill) => skill.name !== skillName),
      libraries: dataset.libraries.map((library) => ({ ...library, skills: library.skills.filter((name) => name !== skillName) })),
      categoryUnits,
      personalSkills: dataset.personalSkills.filter((skill) => skill.name !== skillName),
      changes: [...dataset.changes, lifecycleEvent],
      starredSkills: dataset.starredSkills.filter((record) => record.skill !== skillName),
      relations: dataset.relations.filter((relation) => relation.source?.id !== skillName && relation.target?.id !== skillName),
      skillDetails: dataset.skillDetails.filter((detail) => detail.skill !== skillName),
    },
  };
}

function githubRepoName(sourceUrl) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "") || null;
  } catch {
    return null;
  }
}

function recalculateLibrary(library, skills) {
  const records = library.skills.map((name) => skills.find((skill) => skill.name === name)).filter(Boolean);
  const statusCounts = {};
  for (const skill of records) statusCounts[skill.status] = (statusCounts[skill.status] ?? 0) + 1;
  const categories = [...new Set(records.map((skill) => skill.category).filter(Boolean))];
  return {
    ...library,
    skills: [...new Set(library.skills)],
    categories,
    primary_category: library.primary_category && categories.includes(library.primary_category) ? library.primary_category : (categories[0] ?? null),
    status_counts: statusCounts,
    high_value_count: records.filter((skill) => skill.importance >= 4).length,
    starred_count: records.filter((skill) => skill.star_tier && skill.star_tier !== "none").length,
  };
}

export function publishManagedRecord(dataset, record, at, { appendEvent = true } = {}) {
  const sourceUrl = record.sourceUrl ?? record.repo_url ?? null;
  const descriptionZh = record.description_i18n?.["zh-CN"] ?? record.descriptionZh ?? record.description ?? `用于执行 ${record.name} 相关任务。`;
  const descriptionEn = record.description_i18n?.["en-US"] ?? record.descriptionEn ?? record.description ?? `Handles tasks related to ${record.name}.`;
  const skill = {
    name: record.name,
    description: descriptionZh,
    trigger: record.trigger ?? `$${record.name}`,
    category: record.category ?? "效率与元工作流",
    library_key: "local:global",
    library_title: "global",
    library_page: "Libraries/global.md",
    status: "全局已安装",
    frequency: Number(record.frequency ?? 2),
    importance: Number(record.importance ?? 2),
    star_tier: record.star_tier ?? "none",
    repo: record.repo ?? githubRepoName(sourceUrl),
    repo_url: sourceUrl,
    skill_page: record.skill_page ?? `Skills/${record.name}.md`,
    origin: record.origin ?? inferOrigin(record),
    visibility: record.visibility === "creator-showcase" ? "creator-showcase" : "public",
    description_i18n: {
      "zh-CN": descriptionZh,
      "en-US": descriptionEn,
    },
  };

  const skills = [...dataset.skills.filter((item) => item.name !== record.name), skill];
  const affectedLibraryKeys = new Set(dataset.libraries.filter((library) => library.skills.includes(record.name)).map((library) => library.key));
  let libraries = dataset.libraries.map((library) => ({
    ...library,
    skills: library.skills.filter((name) => name !== record.name),
  }));
  let globalLibrary = libraries.find((library) => library.key === "local:global");
  if (!globalLibrary) {
    globalLibrary = {
      key: "local:global",
      title: "global",
      kind: "local",
      kind_label: "本地",
      source_label: "global",
      source_url: "",
      description: "本地来源 `global` 下发现的 skills。",
      page: "Libraries/global.md",
      skills: [],
      repos: [],
      plugins: [],
      categories: [],
      primary_category: skill.category,
      status_counts: {},
      high_value_count: 0,
      starred_count: 0,
    };
    libraries.push(globalLibrary);
  }
  globalLibrary.skills.push(record.name);
  affectedLibraryKeys.add("local:global");
  libraries = libraries.map((library) => affectedLibraryKeys.has(library.key) ? recalculateLibrary(library, skills) : library);

  let categoryFound = false;
  const categoryUnits = dataset.categoryUnits.map((group) => {
    const units = group.units
      .map((unit) => ({ ...unit, skills: unit.skills.filter((name) => name !== record.name) }))
      .filter((unit) => unit.skills.length > 0)
      .map((unit) => ({ ...unit, skill_count: new Set(unit.skills).size }));
    if (group.category === skill.category) {
      categoryFound = true;
      units.push({
        type: "skill",
        title: record.name,
        kind: "单独 skill",
        skill_count: 1,
        skills: [record.name],
        page: `Skills/${record.name}.md`,
      });
    }
    return { ...group, units, skill_count: new Set(units.flatMap((unit) => unit.skills)).size };
  });
  if (!categoryFound) {
    categoryUnits.push({
      category: skill.category,
      skill_count: 1,
      units: [{ type: "skill", title: record.name, kind: "单独 skill", skill_count: 1, skills: [record.name], page: `Skills/${record.name}.md` }],
    });
  }

  const changes = [...dataset.changes];
  if (appendEvent) {
    const date = String(at).slice(0, 10);
    const baseId = lifecycleEventId(record.name, "published", at);
    changes.push({
      id: uniqueLifecycleId(changes, baseId),
      date,
      type: "published",
      skill: record.name,
      visibility: skill.visibility,
      title: `Published ${record.name} to the Skills Library`,
      summary: `${record.name} was added to the local Skills Library and sanitized Public Export staging data.`,
      title_i18n: {
        "zh-CN": `${record.name} 已进入 Skills Library`,
        "en-US": `Published ${record.name} to the Skills Library`,
      },
      summary_i18n: {
        "zh-CN": `${record.name} 已加入本地 Skills Library，并以净化后的公开字段写入 Public Export 暂存数据。`,
        "en-US": `${record.name} was added to the local Skills Library and sanitized Public Export staging data.`,
      },
    });
  }

  return {
    ...dataset,
    skills,
    libraries,
    categoryUnits,
    changes,
  };
}

const publicDatasetFiles = {
  skills: "skills.json",
  libraries: "libraries.json",
  categoryUnits: "category-units.json",
  personalSkills: "personal-skills.json",
  changes: "changes.json",
  starredSkills: "starred-skills.json",
  relations: "relations.json",
  skillDetails: "skill-details.json",
};

function loadPublicDataset(config) {
  const sourceRoot = path.join(config.repoRoot, "outputs", "data");
  return Object.fromEntries(Object.entries(publicDatasetFiles).map(([key, fileName]) => [key, readJson(path.join(sourceRoot, fileName), [])]));
}

function writePublicDataset(config, dataset, transaction) {
  const sourceRoot = path.join(config.repoRoot, "outputs", "data");
  for (const [key, fileName] of Object.entries(publicDatasetFiles)) {
    const target = path.join(sourceRoot, fileName);
    const current = readJson(target, []);
    if (JSON.stringify(current) === JSON.stringify(dataset[key])) continue;
    writeWithBackup(target, `${JSON.stringify(dataset[key], null, 2)}\n`, transaction);
  }
}

function filterPlanNames(plan, ignoreNames = []) {
  const ignored = new Set([ignoreNames].flat().filter((value) => typeof value === "string"));
  if (ignored.size === 0) return plan;
  const filtered = {
    ...plan,
    additions: plan.additions.filter((item) => !ignored.has(item.name)),
    removals: plan.removals.filter((item) => !ignored.has(item.name)),
    changed: plan.changed.filter((item) => !ignored.has(item.name)),
    ignoredDrift: [...ignored].sort((left, right) => left.localeCompare(right, "en")),
  };
  filtered.requiresConfirmation = filtered.removals.length > 0;
  return filtered;
}

function createPlan(config, { write = true, localOnly = [], ignoreNames = [] } = {}) {
  const inventory = scanInventory(config, { write });
  const plan = filterPlanNames(buildPlanFromInventory({
    inventory,
    publicSkills: loadPublicSkills(config),
    privateCatalog: loadPrivateCatalog(config),
    localOnly,
  }), ignoreNames);
  if (write) writeJsonAtomic(path.join(config.privateRoot, "plans", "plan-latest.json"), plan);
  return plan;
}

function replaceManagedBlock(source, id, content, { afterPattern } = {}) {
  const start = `<!-- ${markerPrefix}:${id}:start -->`;
  const end = `<!-- ${markerPrefix}:${id}:end -->`;
  const block = `${start}\n${content.trim()}\n${end}`;
  const expression = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, "m");
  if (expression.test(source)) return source.replace(expression, block);
  if (afterPattern) {
    const match = source.match(afterPattern);
    if (match?.index !== undefined) {
      const insertion = match.index + match[0].length;
      return `${source.slice(0, insertion)}\n\n${block}${source.slice(insertion)}`;
    }
  }
  return `${source.trimEnd()}\n\n${block}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startTransaction(config) {
  const baseId = config.now.toISOString().replace(/[:.]/g, "-");
  let id = baseId;
  let root = path.join(config.privateRoot, "transactions", id);
  let suffix = 2;
  while (fs.existsSync(root)) {
    id = `${baseId}-${suffix++}`;
    root = path.join(config.privateRoot, "transactions", id);
  }
  fs.mkdirSync(root, { recursive: true });
  return { id, root, files: [] };
}

function writeWithBackup(target, content, transaction) {
  const existed = fs.existsSync(target);
  const backup = path.join(transaction.root, `${String(transaction.files.length + 1).padStart(3, "0")}-${sha256(target).slice(0, 12)}.bak`);
  if (existed) fs.copyFileSync(target, backup);
  transaction.files.push({ target, existed, backup: existed ? backup : null });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, target);
}

function rollbackTransaction(transaction) {
  for (const file of [...transaction.files].reverse()) {
    if (file.existed && file.backup) fs.copyFileSync(file.backup, file.target);
    else if (fs.existsSync(file.target)) fs.unlinkSync(file.target);
  }
}

function finishTransaction(transaction) {
  writeJsonAtomic(path.join(transaction.root, "manifest.json"), { id: transaction.id, files: transaction.files });
}

function skillNote(record, date) {
  const description = record.description || `本地已安装 Skill：${record.name}。`;
  const sourceLabel = record.repo ?? githubRepoName(record.sourceUrl) ?? record.author ?? record.library_title ?? record.name;
  const block = [
    "## 自动维护状态",
    "",
    `- 状态：${record.state === "active" ? "全局已安装" : "已移除"}`,
    `- 公开边界：${record.visibility}`,
    `- 作者来源：${record.origin}`,
    `- 功能分类：[[Categories/${record.category}|${record.category}]]`,
    `- 触发方式：\`${record.trigger}\``,
    `- 首次纳入：${record.addedAt ?? date}`,
    record.removedAt ? `- 移除时间：${record.removedAt}` : null,
    record.sourceUrl ? `- 来源：[${sourceLabel}](${record.sourceUrl})` : "- 来源：本地来源待复核",
    "",
    record.visibility === "local-only" ? "> [!warning] 发布边界" : "> [!success] 发布边界",
    record.visibility === "local-only"
      ? "> 此记录当前为 local-only，仅存在于私人维护层与 Obsidian，不进入 Public Export。"
      : "> 此记录已进入本地 Skills Library 与净化后的 Public Export 暂存数据；只有 Public GitHub main 通过 release-gate 后才能由 Netlify 发布。本机路径、哈希与原始扫描保持私有。",
  ].filter(Boolean).join("\n");
  return [
    "---",
    `title: \"${record.name}\"`,
    `date: ${date}`,
    `status: ${record.state}`,
    "tags:",
    "  - codex/skill-library",
    "  - codex/skill",
    `  - codex/${record.visibility === "local-only" ? "local-only" : "public"}`,
    "---",
    "",
    `# ${record.name}`,
    "",
    "> [!info] 作用",
    `> ${description}`,
    "",
    `<!-- ${markerPrefix}:skill-state:start -->`,
    block,
    `<!-- ${markerPrefix}:skill-state:end -->`,
    "",
    "## 来源与关系",
    "",
    "- Obsidian 索引：[[Codex Skills Library Index]]",
    "- 删除记录入口：[[Skill 墓园]]",
    "",
  ].join("\n");
}

function renderIndexBlock(publicSkills, privateCatalog, capturedAt) {
  const publicGlobal = publicSkills.filter((skill) => skill.status === "全局已安装");
  const privateActive = privateCatalog.skills.filter((skill) => skill.state === "active");
  const total = new Set([...publicGlobal, ...privateActive].map((skill) => skill.name)).size;
  const pending = privateActive.filter((skill) => skill.visibility === "local-only");
  return [
    "> [!info] 自动维护状态",
    `> 最近扫描：${capturedAt}`,
    `> 当前活动全局 Skills：${total}（公开目录 ${publicGlobal.length}，本地未公开 ${pending.length}）`,
    "",
    "### 本地未公开 Skills",
    "",
    ...(pending.length
      ? pending.map((skill) => `- [[Skills/${skill.name}|${skill.name}]] · ${skill.category} · ${skill.origin}`)
      : ["- 无"]),
    "",
    "精确路径、原始扫描与使用统计保存在本机私有状态中，不进入网站构建。",
  ].join("\n");
}

function renderPrivateEvents(privateCatalog) {
  const events = [...privateCatalog.events].sort((left, right) => String(right.at).localeCompare(String(left.at)));
  return [
    "## 自动维护事件",
    "",
    "| 时间 | 类型 | Skill | 说明 |",
    "|---|---|---|---|",
    ...(events.length ? events.map((event) => `| ${event.at} | ${event.type} | [[Skills/${event.skill}|${event.skill}]] | ${event.summary} |`) : ["| - | - | - | 暂无事件 |"]),
  ].join("\n");
}

function renderCategoryBlock(category, privateCatalog) {
  const records = privateCatalog.skills.filter((skill) => skill.state === "active" && skill.visibility === "local-only" && skill.category === category);
  return [
    "## 本地未公开 Skills",
    "",
    ...(records.length
      ? records.map((skill) => `- [[Skills/${skill.name}|${skill.name}]] · ${skill.origin} · ${skill.trigger}`)
      : ["- 无"]),
  ].join("\n");
}

function renderCemeteryBlock(privateCatalog) {
  const records = privateCatalog.skills.filter((skill) => skill.state === "retired");
  return [
    "## 自动维护移除记录",
    "",
    "| Skill | 移除时间 | 原公开边界 | 原来源 |",
    "|---|---|---|---|",
    ...(records.length
      ? records.map((skill) => `| ${skill.name} | ${skill.removedAt ?? "-"} | ${skill.previousVisibility ?? skill.visibility} | ${skill.sourceUrl ?? "待复核"} |`)
      : ["| - | - | - | 暂无新增记录 |"]),
  ].join("\n");
}

function writeObsidian(config, publicSkills, privateCatalog, capturedAt, transaction) {
  const vault = config.vaultRoot;
  if (!fs.existsSync(vault)) throw new Error(`Obsidian library not found: ${vault}`);
  const date = capturedAt.slice(0, 10);
  for (const record of privateCatalog.skills) {
    const notePath = ensureInside(vault, path.join(vault, "Skills", `${record.name}.md`), "Obsidian Skill note");
    const existing = fs.existsSync(notePath) ? fs.readFileSync(notePath, "utf8") : "";
    let next = existing
      ? replaceManagedBlock(existing, "skill-state", skillNote(record, date).match(/<!-- skills-library-maintenance:skill-state:start -->\n([\s\S]*?)\n<!-- skills-library-maintenance:skill-state:end -->/)?.[1] ?? "")
      : skillNote(record, date);
    if (existing) {
      const visibilityTag = `  - codex/${record.visibility === "local-only" ? "local-only" : "public"}`;
      next = next.replace(/^  - codex\/(?:local-only|public)$/m, visibilityTag);
    }
    if (next !== existing) writeWithBackup(notePath, next, transaction);
  }

  const indexPath = ensureInside(vault, path.join(vault, "Codex Skills Library Index.md"), "Obsidian index");
  const indexSource = fs.readFileSync(indexPath, "utf8");
  let nextIndex = replaceManagedBlock(indexSource, "current-state", renderIndexBlock(publicSkills, privateCatalog, capturedAt), { afterPattern: /^# Codex Skills Library Index\s*$/m });
  nextIndex = replaceManagedBlock(nextIndex, "private-events", renderPrivateEvents(privateCatalog));
  if (nextIndex !== indexSource) writeWithBackup(indexPath, nextIndex, transaction);

  const categories = new Set(privateCatalog.skills.map((skill) => skill.category).filter(Boolean));
  for (const category of categories) {
    const categoryPath = ensureInside(vault, path.join(vault, "Categories", `${category}.md`), "Obsidian category");
    if (!fs.existsSync(categoryPath)) continue;
    const source = fs.readFileSync(categoryPath, "utf8");
    const next = replaceManagedBlock(source, "local-only", renderCategoryBlock(category, privateCatalog));
    if (next !== source) writeWithBackup(categoryPath, next, transaction);
  }

  const cemeteryPath = ensureInside(vault, path.join(vault, "Skill 墓园.md"), "Obsidian cemetery");
  const cemeterySource = fs.readFileSync(cemeteryPath, "utf8");
  const nextCemetery = replaceManagedBlock(cemeterySource, "retired", renderCemeteryBlock(privateCatalog));
  if (nextCemetery !== cemeterySource) writeWithBackup(cemeteryPath, nextCemetery, transaction);
}

function latestUpdateCheck(config) {
  return readJson(path.join(config.privateRoot, "updates", "latest.json"), null);
}

export function sanitizeMaintenanceStatus({ publicSkills, capturedAt, updateCheck }) {
  const publicCatalog = publicSkills.filter((skill) => skill.visibility !== "local-only");
  return {
    schemaVersion: 1,
    snapshotDate: capturedAt.slice(0, 10),
    privacy: "sanitized",
    catalogSkills: publicCatalog.length,
    publicGlobalSkills: publicCatalog.filter((skill) => skill.status === "全局已安装").length,
    publicationHandoff: {
      productionAuthority: "public-github-main",
      publicRepository: "Lucifer-St/silent-orbit-skills-library",
      requiredCheck: "release-gate",
      deployProvider: "netlify",
      directPrivateProductionDeploy: false,
    },
    channels: [
      {
        id: "source-managed-global",
        state: updateCheck?.global?.state ?? "unchecked",
        checkedSources: updateCheck?.global?.checkedSources?.length ?? 0,
        execution: "local-codex",
      },
      { id: "plugins", state: "external", execution: "local-codex" },
      { id: "system", state: "system-managed", execution: "codex-runtime" },
    ],
    handoffPrompt: {
      "zh-CN": "使用 $skills-library-maintenance 检查所有 Skill 更新，先展示计划，不要直接更新。",
      "en-US": "Use $skills-library-maintenance to check all Skill updates and show the plan before changing anything.",
    },
  };
}

function synchronizePublicApp(config) {
  const projectDir = path.join(config.repoRoot, "work", "agent-os-index");
  run("npm", ["run", "sync:data"], { cwd: projectDir });
  run("npm", ["run", "validate:data"], { cwd: projectDir });
}

function syncPlan(config, options = {}) {
  const localOnly = options["local-only"] ?? [];
  const ignoreNames = options["ignore-live"] ?? [];
  const plan = createPlan(config, { write: true, localOnly, ignoreNames });
  const privateCatalog = loadPrivateCatalog(config);
  const confirmed = new Set([options["confirm-removal"]].flat().filter((value) => typeof value === "string"));
  const liveByName = new Map(scanInventory(config, { write: false }).globalSkills.map((skill) => [skill.name, skill]));
  const at = config.now.toISOString();
  let publicDataset = loadPublicDataset(config);
  const publishNames = new Set([options.publish].flat().filter((value) => typeof value === "string"));

  function applyMetadata(record, includeOverrides = false) {
    if (includeOverrides && typeof options["source-url"] === "string") record.sourceUrl = options["source-url"];
    if (includeOverrides && typeof options.author === "string") record.author = options.author;
    if (includeOverrides && typeof options.origin === "string") record.origin = options.origin;
    if (includeOverrides && typeof options.category === "string") record.category = options.category;
    if (includeOverrides && typeof options["description-zh"] === "string") record.descriptionZh = options["description-zh"];
    if (includeOverrides && typeof options["description-en"] === "string") record.descriptionEn = options["description-en"];
    record.library_key = "local:global";
    record.library_title = "global";
    record.library_page = "Libraries/global.md";
    return record;
  }

  for (const addition of plan.additions) {
    const retired = privateCatalog.skills.find((skill) => skill.name === addition.name && skill.state === "retired");
    if (retired) {
      Object.assign(retired, addition, {
        state: "active",
        removedAt: null,
        visibility: addition.visibility,
        previousVisibility: retired.previousVisibility ?? addition.previousVisibility ?? retired.visibility,
      });
      delete retired.reactivation;
      if (retired.visibility !== "local-only") {
        applyMetadata(retired);
        publicDataset = publishManagedRecord(publicDataset, retired, at);
      }
      appendPrivateEvent(privateCatalog, { at, type: "reactivated", skill: retired.name, summary: retired.visibility === "local-only" ? "同一 Skill 身份重新出现，并按明确的 local-only 例外恢复。" : "同一 Skill 身份重新出现，并按默认公开规则恢复到本地与 Public Export 暂存数据。" });
    } else {
      const record = { ...addition };
      delete record.reactivation;
      privateCatalog.skills.push(record);
      if (record.visibility !== "local-only") {
        applyMetadata(record);
        publicDataset = publishManagedRecord(publicDataset, record, at);
      }
      appendPrivateEvent(privateCatalog, { at, type: "installed", skill: addition.name, summary: record.visibility === "local-only" ? "已按明确例外纳入私人维护层，不进入公开目录。" : "已按默认规则加入本地 Skills Library 与净化后的 Public Export 暂存数据。" });
    }
  }
  for (const name of publishNames) {
    const record = privateCatalog.skills.find((skill) => skill.name === name && skill.state === "active");
    if (!record) throw new Error(`Cannot publish unknown or inactive managed Skill: ${name}`);
    applyMetadata(record, true);
    record.visibility = record.origin === "creator" ? "creator-showcase" : "public";
    publicDataset = publishManagedRecord(publicDataset, record, at);
    appendPrivateEvent(privateCatalog, { at, type: "published", skill: record.name, summary: "经用户确认，已从 local-only 提升为本地与 Public Export 暂存公开；Production 仍须经 Public main 与 release-gate。" });
  }
  for (const change of plan.changed) {
    const record = privateCatalog.skills.find((skill) => skill.name === change.name);
    const live = liveByName.get(change.name);
    if (!record || !live) continue;
    record.skillFileSha256 = live.skillFileSha256;
    record.version = live.version;
    record.description = live.description || record.description;
    if (record.visibility !== "local-only") publicDataset = publishManagedRecord(publicDataset, record, at, { appendEvent: false });
    appendPrivateEvent(privateCatalog, { at, type: "updated", skill: record.name, summary: "SKILL.md 内容或版本发生变化。" });
  }
  const pendingRemovals = [];
  for (const removal of plan.removals) {
    if (!confirmed.has(removal.name)) {
      pendingRemovals.push(removal.name);
      continue;
    }
    let record = privateCatalog.skills.find((skill) => skill.name === removal.name);
    if (!record) {
      const publicRecord = publicDataset.skills.find((skill) => skill.name === removal.name);
      record = {
        ...(publicRecord ?? { name: removal.name, origin: "unknown", visibility: removal.previousVisibility ?? "local-only" }),
        state: "retired",
        addedAt: null,
      };
      privateCatalog.skills.push(record);
    }
    record.previousVisibility = record.previousVisibility ?? record.visibility ?? removal.previousVisibility ?? "local-only";
    record.visibility = "local-only";
    record.state = "retired";
    record.removedAt = at;
    appendPrivateEvent(privateCatalog, { at, type: "removed", skill: record.name, summary: "用户确认后从活动全局 Skill 表面移除；生命周期记录已保留。" });
    publicDataset = retirePublicDataset(publicDataset, removal.name, at).dataset;
  }
  privateCatalog.skills.sort((left, right) => left.name.localeCompare(right.name));

  const transaction = startTransaction(config);
  try {
    writePublicDataset(config, publicDataset, transaction);
    const catalogTarget = privateCatalogPath(config);
    writeWithBackup(catalogTarget, `${JSON.stringify(privateCatalog, null, 2)}\n`, transaction);
    const publicSkills = publicDataset.skills;
    writeObsidian(config, publicSkills, privateCatalog, at, transaction);
    const status = sanitizeMaintenanceStatus({ publicSkills, capturedAt: at, updateCheck: latestUpdateCheck(config) });
    const statusPath = path.join(config.repoRoot, "outputs", "data", "maintenance-status.json");
    writeWithBackup(statusPath, `${JSON.stringify(status, null, 2)}\n`, transaction);
    synchronizePublicApp(config);
    const verification = pendingRemovals.length > 0 ? null : verify(config, { ignoreNames });
    if (verification && !verification.ok) throw new Error(`Post-sync verification failed: ${verification.failures.join("; ")}`);
    finishTransaction(transaction);
    return {
      plan,
      pendingRemovals,
      requiresConfirmation: pendingRemovals.length > 0,
      converged: pendingRemovals.length === 0,
      transaction: transaction.id,
      privateActive: privateCatalog.skills.filter((skill) => skill.state === "active").length,
      verification,
    };
  } catch (error) {
    rollbackTransaction(transaction);
    try {
      synchronizePublicApp(config);
    } catch (recoveryError) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}; generated-output recovery also failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
    }
    throw error;
  }
}

function parseUpdateCheck(output, status) {
  const cleanOutput = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  const checkedSources = [...cleanOutput.matchAll(/source:\s*([^\r\n]+)/gi)].map((match) => match[1].trim());
  let state = "unchecked";
  if (status !== 0) state = "error";
  else if (/all global skills are up to date|updated \d+ skill/i.test(cleanOutput)) state = "current";
  else if (/updates? (?:are )?available|can be updated/i.test(cleanOutput)) state = "update-available";
  return { state, checkedSources };
}

function trustedBatchPaths(config, options = {}) {
  const projectRoot = path.join(config.repoRoot, "work", "agent-os-index");
  return {
    packageRoot: path.resolve(String(options["manager-package-root"] ?? path.join(projectRoot, "node_modules", "skills"))),
    packageLockPath: path.resolve(String(options["manager-package-lock"] ?? path.join(projectRoot, "package-lock.json"))),
    profileRoot: path.resolve(String(options["profile-root"] ?? os.homedir())),
    stateHome: options["state-home"]
      ? path.resolve(String(options["state-home"]))
      : (process.env.XDG_STATE_HOME ? path.resolve(process.env.XDG_STATE_HOME) : undefined),
  };
}

function trustedBatchSkillNames(options = {}) {
  const names = [options.skill].flat().filter((value) => typeof value === "string");
  return names.length ? names : undefined;
}

function planTrustedSourceBatch(config, options = {}) {
  const preflight = createPlan(config, { write: true });
  const paths = trustedBatchPaths(config, options);
  const trustedPlan = createTrustedSourceBatchPlanV1({
    ...paths,
    privateRoot: config.privateRoot,
    skillNames: trustedBatchSkillNames(options),
    allowDisposableSource: options["disposable-profile"] === true,
  });
  const explainedAdditions = new Set([
    ...trustedPlan.excluded.pluginManaged,
    ...trustedPlan.limitations.lockFolderHashUnavailable,
  ]);
  const unreviewedAdditions = preflight.additions
    .map((item) => item.name)
    .filter((name) => !explainedAdditions.has(name));
  const selectedNames = new Set(trustedPlan.entries.map((entry) => entry.name));
  const maintenanceIgnoredDrift = [
    ...preflight.additions.map((item) => item.name),
    ...preflight.changed.map((item) => item.name).filter((name) => !selectedNames.has(name)),
  ].sort((left, right) => left.localeCompare(right, "en"));
  const maintenanceBlockers = [
    ...(unreviewedAdditions.length ? [`unreviewed-additions:${unreviewedAdditions.join(",")}`] : []),
    ...(preflight.removals.length ? [`unconfirmed-removals:${preflight.removals.map((item) => item.name).join(",")}`] : []),
  ];
  return {
    ...trustedPlan,
    maintenancePreflight: {
      additions: preflight.additions.map((item) => item.name),
      removals: preflight.removals.map((item) => item.name),
      changed: preflight.changed.map((item) => item.name),
    },
    maintenanceBlockers,
    maintenanceIgnoredDrift,
    executable: trustedPlan.executable && maintenanceBlockers.length === 0,
  };
}

function checkAndUpdate(config, options = {}) {
  const plan = planTrustedSourceBatch(config, options);
  const confirmation = options["confirm-trusted-batch"];
  if (confirmation === undefined || confirmation === true) {
    return {
      schemaVersion: 1,
      operation: "check-and-update",
      aliasUsed: options["alias-used"] ?? null,
      plan,
      requiresConfirmation: true,
      confirmationToken: plan.confirmation.token,
    };
  }
  if (!plan.executable) {
    throw new Error(`Trusted source batch is blocked: ${[...plan.blockers, ...plan.maintenanceBlockers].join("; ")}`);
  }

  const receipt = executeTrustedSourceBatchV1({
    plan,
    confirmation,
    rescan: ({ diff }) => {
      const inventory = scanInventory(config, { write: true });
      return {
        ok: true,
        capturedAt: inventory.capturedAt,
        liveGlobalSkills: inventory.globalSkills.length,
        changed: diff.changed.map((item) => item.name),
      };
    },
    synchronize: ({ plan: reviewedPlan, diff, managerResult }) => {
      const raw = `${managerResult.stdout ?? ""}${managerResult.stderr ?? ""}`;
      const record = {
        schemaVersion: 2,
        operation: "check-and-update",
        checkedAt: config.now.toISOString(),
        manager: reviewedPlan.manager,
        nativeTransactionGuarantee: false,
        global: {
          ...parseUpdateCheck(raw, managerResult.status),
          checkedSources: reviewedPlan.entries.map((entry) => entry.sourceIdentity),
          changedSkills: diff.changed.map((item) => item.name),
          raw,
        },
        plugins: { state: "external", note: "Plugin marketplace and installed plugin versions use a separate workflow." },
        system: { state: "system-managed", note: "System Skills follow the Codex runtime." },
      };
      writeJsonAtomic(path.join(config.privateRoot, "updates", "latest.json"), record);
      const synced = syncPlan(config, { ...options, "ignore-live": reviewedPlan.maintenanceIgnoredDrift });
      if (synced.requiresConfirmation || synced.verification?.ok !== true) {
        throw new Error(`Library synchronization did not converge: ${synced.pendingRemovals.join(", ") || "verification failed"}.`);
      }
      return {
        verification: synced.verification,
        transaction: synced.transaction,
        privateActive: synced.privateActive,
        obsidianSynchronized: true,
        publicProjectionSynchronized: true,
        ignoredPreExistingDrift: reviewedPlan.maintenanceIgnoredDrift,
      };
    },
    clock: () => config.now.toISOString(),
  });
  return {
    operation: "check-and-update",
    aliasUsed: options["alias-used"] ?? null,
    plan: {
      batchId: plan.batchId,
      entries: plan.entries.map((entry) => ({
        name: entry.name,
        sourceIdentity: entry.sourceIdentity,
        beforeSha256: entry.folderSha256,
      })),
    },
    receipt,
    requiresConfirmation: false,
  };
}

function monthFromOptions(options, now) {
  if (typeof options.month === "string" && /^\d{4}-\d{2}$/.test(options.month)) return options.month;
  if (options["previous-month"]) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return date.toISOString().slice(0, 7);
  }
  return now.toISOString().slice(0, 7);
}

function collectJsonlFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(target);
    }
  }
  return files;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => item?.text ?? item?.content ?? "").join("\n");
}

export function aggregateUsageFromFiles({ files, month, knownSkillNames }) {
  const evidence = new Map();
  const known = new Set(knownSkillNames);
  for (const file of files) {
    let sessionId = path.basename(file, ".jsonl");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!line) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (row.type === "session_meta") {
        sessionId = row.payload?.id ?? row.payload?.session_id ?? sessionId;
        continue;
      }
      const timestamp = String(row.timestamp ?? "");
      if (!timestamp.startsWith(month)) continue;
      const payload = row.payload ?? {};
      const turnId = payload.internal_chat_message_metadata_passthrough?.turn_id ?? `${sessionId}:${lineIndex}`;
      const found = [];
      if (row.type === "response_item" && payload.type === "message" && payload.role === "user") {
        for (const match of contentText(payload.content).matchAll(/\$([a-z0-9][a-z0-9:-]*)/gi)) {
          const name = match[1].includes(":") ? match[1].split(":").at(-1) : match[1];
          if (known.has(name)) found.push({ name, type: "explicit-invocation", confidence: "high" });
        }
      }
      if (row.type === "response_item" && payload.type === "custom_tool_call" && payload.name === "exec") {
        for (const match of String(payload.input ?? "").matchAll(/[\\/]([a-z0-9][a-z0-9._-]*)[\\/]SKILL\.md/gi)) {
          if (known.has(match[1])) found.push({ name: match[1], type: "skill-file-read", confidence: "medium" });
        }
      }
      for (const item of found) {
        const key = `${turnId}:${item.name}`;
        const prior = evidence.get(key);
        if (!prior || item.confidence === "high") evidence.set(key, { ...item, timestamp, sessionId, turnId });
      }
    }
  }
  const bySkill = new Map();
  for (const item of evidence.values()) {
    const record = bySkill.get(item.name) ?? { name: item.name, task_count: 0, last_seen_at: null, evidence_types: new Set(), confidence: "medium" };
    record.task_count += 1;
    if (!record.last_seen_at || item.timestamp > record.last_seen_at) record.last_seen_at = item.timestamp;
    record.evidence_types.add(item.type);
    if (item.confidence === "high") record.confidence = "high";
    bySkill.set(item.name, record);
  }
  return [...bySkill.values()]
    .map((record) => ({ ...record, evidence_types: [...record.evidence_types].sort() }))
    .sort((left, right) => right.task_count - left.task_count || left.name.localeCompare(right.name));
}

function renderUsageNote(month, usage, generatedAt) {
  return [
    "---",
    `title: \"Skills Monthly Usage ${month}\"`,
    `date: ${generatedAt.slice(0, 10)}`,
    "status: private",
    "tags:",
    "  - codex/skill-library",
    "  - codex/private-usage",
    "---",
    "",
    `# ${month} Skills 使用快照`,
    "",
    "> [!warning] 私有记录",
    "> 本页只保存去重后的任务级聚合，不包含聊天原文，也不会进入公开网站或 Git。",
    "",
    "| Skill | 任务数 | 最后使用 | 证据 | 置信度 |",
    "|---|---:|---|---|---|",
    ...(usage.length
      ? usage.map((record) => `| [[Skills/${record.name}|${record.name}]] | ${record.task_count} | ${record.last_seen_at ?? "-"} | ${record.evidence_types.join(", ")} | ${record.confidence} |`)
      : ["| - | 0 | - | - | - |"]),
    "",
  ].join("\n");
}

function writeUsage(config, options) {
  const month = monthFromOptions(options, config.now);
  const monthRoot = path.join(config.sessionsRoot, ...month.split("-"));
  const publicNames = loadPublicSkills(config).map((skill) => skill.name);
  const privateNames = loadPrivateCatalog(config).skills.map((skill) => skill.name);
  const usage = aggregateUsageFromFiles({ files: collectJsonlFiles(monthRoot), month, knownSkillNames: [...publicNames, ...privateNames] });
  const record = { schemaVersion: 1, month, generatedAt: config.now.toISOString(), usage };
  if (options.write) {
    const transaction = startTransaction(config);
    try {
      record.transaction = transaction.id;
      const privateTarget = path.join(config.privateRoot, "usage", `${month}.json`);
      writeWithBackup(privateTarget, `${JSON.stringify(record, null, 2)}\n`, transaction);
      const target = ensureInside(config.vaultRoot, path.join(config.vaultRoot, "Monthly Usage", `${month}.md`), "monthly usage note");
      writeWithBackup(target, renderUsageNote(month, usage, record.generatedAt), transaction);
      const indexPath = ensureInside(config.vaultRoot, path.join(config.vaultRoot, "Skills Monthly Usage Index.md"), "monthly usage index");
      const source = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "# Skills Monthly Usage Index\n";
      const links = fs.readdirSync(path.dirname(target)).filter((name) => /^\d{4}-\d{2}\.md$/.test(name)).sort().reverse().map((name) => `- [[Monthly Usage/${name.slice(0, -3)}|${name.slice(0, -3)}]]`);
      writeWithBackup(indexPath, replaceManagedBlock(source, "usage-index", ["## 月度快照", "", ...links].join("\n")), transaction);
      finishTransaction(transaction);
    } catch (error) {
      rollbackTransaction(transaction);
      throw error;
    }
  }
  return record;
}

function verify(config, { ignoreNames = [] } = {}) {
  const inventory = scanInventory(config, { write: false });
  const plan = filterPlanNames(
    buildPlanFromInventory({ inventory, publicSkills: loadPublicSkills(config), privateCatalog: loadPrivateCatalog(config) }),
    ignoreNames,
  );
  const failures = [];
  if (plan.additions.length) failures.push(`Untracked live Skills: ${plan.additions.map((item) => item.name).join(", ")}`);
  if (plan.removals.length) failures.push(`Unconfirmed removals: ${plan.removals.map((item) => item.name).join(", ")}`);
  const publicNames = new Set(loadPublicSkills(config).map((skill) => skill.name));
  const managedCatalog = loadPrivateCatalog(config);
  for (const record of managedCatalog.skills) {
    if (record.state === "active" && record.visibility !== "local-only" && !publicNames.has(record.name)) {
      failures.push(`Managed public Skill is missing from public catalog: ${record.name}`);
    }
    if ((record.state !== "active" || record.visibility === "local-only") && publicNames.has(record.name)) {
      failures.push(`Private or retired managed Skill leaked into public catalog: ${record.name}`);
    }
  }
  const publicRoot = path.join(config.repoRoot, "work", "agent-os-index", "public", "data");
  if (fs.existsSync(publicRoot)) {
    for (const file of collectFiles(publicRoot)) {
      const text = fs.readFileSync(file, "utf8");
      if (/C:\\Users\\|\/Users\/|"visibility"\s*:\s*"local-only"|"task_count"\s*:/.test(text)) {
        failures.push(`Private data leaked into public output: ${path.relative(config.repoRoot, file)}`);
      }
    }
  }
  return { ok: failures.length === 0, failures, liveGlobalSkills: inventory.globalSkills.length, plan };
}

function collectFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files;
}

function exactLiveSkill(config, name) {
  const matches = loadLiveEntries(config).filter((skill) => skill.name === name);
  if (matches.length !== 1) throw new Error(`Expected one exact global Skill named ${name}; found ${matches.length}.`);
  return matches[0];
}

function installSkill(config, options) {
  if (!options.confirm) throw new Error("Install requires --confirm after the user approves the exact source.");
  if (typeof options.source !== "string") throw new Error("Install requires --source <source>.");
  run("npx", ["skills", "add", options.source, "-g", "-a", "codex", "-y"], { cwd: config.repoRoot });
  return syncPlan(config, options);
}

function removeSkill(config, options) {
  if (typeof options.skill !== "string") throw new Error("Remove requires --skill <exact-name>.");
  exactLiveSkill(config, options.skill);
  if (!options.confirm) {
    return { dryRun: true, skill: options.skill, command: `npx skills remove ${options.skill} -g -y`, requiresConfirmation: true };
  }
  run("npx", ["skills", "remove", options.skill, "-g", "-y"], { cwd: config.repoRoot });
  return syncPlan(config, { ...options, "confirm-removal": options.skill });
}

function updateSkills(config, options) {
  if (!options.all && typeof options.skill !== "string") throw new Error("Update requires --skill <exact-name> or --all.");
  return checkAndUpdate(config, { ...options, "alias-used": "update" });
}

function printHelp() {
  return `Skills Library Maintenance\n\nCommands:\n  configure --repo-root <path> [--vault-root <path>]\n  scan\n  plan [--local-only <exact-name>]\n  sync [--local-only <exact-name>] [--publish <exact-name>] [--confirm-removal <exact-name>]\n  check-and-update [--skill <exact-name>] [--confirm-trusted-batch <exact token>]\n  check-updates [same options]  # documented compatibility alias; not read-only\n  install --source <source> --confirm [--local-only]\n  remove --skill <exact-name> [--confirm]\n  update (--skill <exact-name>|--all) [--confirm-trusted-batch <exact token>]\n  usage (--month YYYY-MM|--previous-month) [--write]\n  verify\n`;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const config = resolveConfig(parsed.options);
  let result;
  switch (parsed.command) {
    case "configure": result = configure(config); break;
    case "scan": result = scanInventory(config, { write: true }); break;
    case "plan": result = createPlan(config, { write: true, localOnly: parsed.options["local-only"] ?? [] }); break;
    case "sync": {
      result = syncPlan(config, parsed.options);
      if (result.requiresConfirmation) process.exitCode = 2;
      break;
    }
    case "check-and-update": {
      result = checkAndUpdate(config, parsed.options);
      if (result.requiresConfirmation) process.exitCode = 2;
      else if (!["succeeded"].includes(result.receipt.status)) process.exitCode = 1;
      break;
    }
    case "check-updates": {
      result = checkAndUpdate(config, { ...parsed.options, "alias-used": "check-updates" });
      if (result.requiresConfirmation) process.exitCode = 2;
      else if (!["succeeded"].includes(result.receipt.status)) process.exitCode = 1;
      break;
    }
    case "usage": result = writeUsage(config, parsed.options); break;
    case "verify": {
      result = verify(config);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case "install": result = installSkill(config, parsed.options); break;
    case "remove": {
      result = removeSkill(config, parsed.options);
      if (result.requiresConfirmation) process.exitCode = 2;
      break;
    }
    case "update": {
      result = updateSkills(config, parsed.options);
      if (result.requiresConfirmation) process.exitCode = 2;
      else if (!["succeeded"].includes(result.receipt.status)) process.exitCode = 1;
      break;
    }
    case "help":
    case "--help":
    case "-h": console.log(printHelp()); return;
    default: throw new Error(`Unknown command: ${parsed.command}\n\n${printHelp()}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  checkAndUpdate,
  filterPlanNames,
  parseArgs,
  parseUpdateCheck,
  planTrustedSourceBatch,
  replaceManagedBlock,
  resolveConfig,
  syncPlan,
  verify,
  writeUsage,
};
