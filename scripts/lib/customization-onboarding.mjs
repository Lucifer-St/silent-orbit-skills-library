import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFrontendHandoffV2 } from "./generator-contracts.mjs";
import { validateSilentOrbitConfigV1 } from "./silent-orbit-project.mjs";
import { validateDesignProfileV2 } from "./skill-cosmos-customization.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, "../..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const previewTemplateRoot = path.join(packageRoot, "templates", "reference-index-v1");
const ONBOARDING_FILE = ".silent-orbit/customization/onboarding.v3.json";
const INTERVIEW_FILE = ".silent-orbit/customization/interview.v3.json";
const INTERVIEW_CONFIRMATION_FILE = ".silent-orbit/customization/interview-confirmation.v3.json";
const QUESTION_COUNT = 6;
const QUESTION_IDS = Object.freeze([
  "familiar-places",
  "avoid",
  "feeling",
  "find-things",
  "reading-surface",
  "comfort",
]);

const QUESTIONS = Object.freeze([
  {
    id: QUESTION_IDS[0],
    prompt: "想象一个你愿意每天打开的页面：它让你想到哪些网站、书、应用或真实空间？为什么舒服？",
    examples: ["像一本留白很多的杂志，读起来不赶。", "像常用的工具应用，东西都在该在的位置。", "像一张可以慢慢探索的星图。"],
  },
  {
    id: QUESTION_IDS[1],
    prompt: "有哪些页面会让你马上想关掉？只要说让你不舒服的地方就好。",
    examples: ["一屏塞得太满，我不知道先看哪里。", "霓虹色和动画太多，眼睛累。", "到处都是相同的卡片，看不出重点。"],
  },
  {
    id: QUESTION_IDS[2],
    prompt: "你希望这个空间给你什么感觉？像形容一个房间那样说就可以。",
    examples: ["安静、清楚，像整理好的书房。", "温暖、有一点生命力，但不要吵。", "利落、可靠，像一件好用的工具。"],
  },
  {
    id: QUESTION_IDS[3],
    prompt: "你平时找东西时，更想先看一份清楚的目录，还是先在一张关系图里逛？页面一次放多少内容会舒服？",
    examples: ["先给我目录，我通常知道自己要找什么。", "先看关系图，我喜欢顺着关联探索。", "两种都可以；内容别太挤就好。"],
  },
  {
    id: QUESTION_IDS[4],
    prompt: "如果把页面比作一张纸，你希望字和颜色给人什么感觉？",
    examples: ["像书刊，字舒服，颜色克制。", "像清楚的工具界面，黑白分明。", "亲切一点、圆润一点，颜色柔和。"],
  },
  {
    id: QUESTION_IDS[5],
    prompt: "最后说说使用时的舒服程度：动画、对比度和手机使用，有什么需要我们照顾的吗？",
    examples: ["动画越少越好，我容易分心或不舒服。", "可以有一点自然反馈，但别一直动。", "我主要用手机，希望小屏也一样好用。"],
  },
]);

const SKIP_PATTERN = /^(?:(?:我)?(?:不知道|不确定|没想好|随便|都可以|无所谓)(?:[，,]\s*(?:这题)?(?:先)?跳过)?|(?:这题)?(?:先)?跳过|skip|pass)[。.!！]?$/iu;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invariant(condition, message) {
  if (!condition) throw new Error(`Silent Orbit onboarding violation: ${message}`);
}

function assertExactKeys(value, allowed, label) {
  invariant(isRecord(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  invariant(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} field inventory is invalid.`);
}

function safeShortString(value, label, maxLength = 500) {
  invariant(typeof value === "string" && value.length > 0 && value.length <= maxLength, `${label} is invalid.`);
  return value;
}

function safeStringList(value, label, { min = 1, max = 12 } = {}) {
  invariant(Array.isArray(value) && value.length >= min && value.length <= max, `${label} is invalid.`);
  value.forEach((entry, index) => safeShortString(entry, `${label}[${index}]`, 240));
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const nonce = `${process.pid}-${randomBytes(12).toString("hex")}`;
  const temporary = `${target}.tmp-${nonce}`;
  const backup = `${target}.bak-${nonce}`;
  fs.writeFileSync(temporary, stableJson(value), { encoding: "utf8", flag: "wx" });
  let backedUp = false;
  let committed = false;
  try {
    if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(temporary, target);
    committed = true;
  } catch (error) {
    if (!committed && !fs.existsSync(target) && backedUp && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
  if (backedUp && fs.existsSync(backup)) {
    try {
      fs.rmSync(backup, { force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      throw new Error(`Project-local write committed, but obsolete backup cleanup failed at ${path.basename(backup)}.`, { cause: error });
    }
  }
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeTimestamp(value, label) {
  const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
  invariant(typeof value === "string" && canonicalUtc.test(value) && !Number.isNaN(Date.parse(value)), `${label} must be an ISO timestamp.`);
  return value;
}

function portableId(value, fallback = "personal-aesthetic") {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return /^[a-z0-9]/.test(normalized) ? normalized : fallback;
}

function readJsonResult(target) {
  if (!fs.existsSync(target)) return { state: "missing", value: null, error: null };
  try {
    return { state: "present", value: JSON.parse(fs.readFileSync(target, "utf8")), error: null };
  } catch (error) {
    return { state: "invalid", value: null, error: error.message };
  }
}

function existingFile(candidates) {
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function normalizeCandidatePaths(value, defaults) {
  if (value === undefined) return defaults;
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter((candidate) => typeof candidate === "string" && candidate.length > 0).map((candidate) => path.resolve(candidate));
}

function validateOnboardingConfig(value, projectId) {
  assertExactKeys(value, ["schemaVersion", "kind", "projectId", "configuredAt", "scope", "preview", "permissions"], "onboarding.v3.json");
  invariant(value.schemaVersion === 3 && value.kind === "CustomizationOnboardingV3", "onboarding.v3.json identity is invalid.");
  invariant(value.projectId === projectId, "onboarding.v3.json belongs to another project.");
  safeTimestamp(value.configuredAt, "onboarding.v3.json configuredAt");
  invariant(value.scope === "project-only", "onboarding.v3.json must stay project-only.");
  assertExactKeys(value.preview, ["mode"], "onboarding.v3.json preview");
  invariant(value.preview.mode === "bundled-static", "onboarding.v3.json preview mode is invalid.");
  assertExactKeys(value.permissions, ["globalInstall", "systemConfiguration", "outsideProjectWrites"], "onboarding.v3.json permissions");
  invariant(
    value.permissions?.globalInstall === false
      && value.permissions?.systemConfiguration === false
      && value.permissions?.outsideProjectWrites === false,
    "onboarding.v3.json permissions are too broad.",
  );
  return value;
}

function confirmationToken(projectRoot, projectId) {
  const rootIdentity = fs.existsSync(projectRoot) ? fs.realpathSync(projectRoot) : path.resolve(projectRoot);
  const digest = createHash("sha256")
    .update(`silent-orbit-customization-onboarding-v3\0${rootIdentity}\0${projectId}`)
    .digest("hex")
    .slice(0, 16);
  return `confirm-project-onboarding:${projectId}:${digest}`;
}

function check(id, state, summary, detail) {
  return { id, state, summary, ...(detail ? { detail } : {}) };
}

/**
 * Read-only onboarding preflight. It reads only the named project, bundled
 * package assets, and explicitly supplied Agent/browser paths.
 */
export function preflightCustomizationOnboardingV3({
  projectDirectory = ".",
  nodeVersion = process.versions.node,
  agentPaths,
  browserPaths,
} = {}) {
  const projectRoot = path.resolve(projectDirectory);
  const rootIsDirectory = (() => {
    try {
      return fs.statSync(projectRoot).isDirectory();
    } catch {
      return false;
    }
  })();
  const checks = [];

  const nodeMajor = Number.parseInt(String(nodeVersion).replace(/^v/u, "").split(".")[0], 10);
  checks.push(nodeMajor === 24
    ? check("node-24", "pass", `已有 Node 24（${String(nodeVersion).replace(/^v/u, "")}）。`)
    : check("node-24", "missing", "还没有使用 Node 24。", "个性化生成与本地预览按 Node 24 验证；preflight 不会替你安装或切换全局 Node。"));

  const configPath = path.join(projectRoot, "silent-orbit.config.json");
  const configResult = readJsonResult(configPath);
  let projectConfig = null;
  let projectId = portableId(path.basename(projectRoot), "silent-orbit-project");
  if (!rootIsDirectory) {
    checks.push(check("project-config", "missing", "没有找到这个项目目录。", "请选择一个已经创建的 Silent Orbit 项目；这里不会替你在别处建项目。"));
  } else if (configResult.state === "missing") {
    checks.push(check("project-config", "missing", "项目里缺少 silent-orbit.config.json。", "需要先有一个明确的 Silent Orbit 项目，才能保证配置不会写错地方。"));
  } else if (configResult.state === "invalid") {
    checks.push(check("project-config", "error", "项目配置目前无法读取。", "请先修复现有 JSON；preflight 不会覆盖它。"));
  } else {
    try {
      const config = validateSilentOrbitConfigV1(configResult.value);
      projectConfig = config.project;
      projectId = config.project.projectId;
      checks.push(check("project-config", "pass", "已找到可用的 Silent Orbit 项目配置。"));
    } catch (error) {
      checks.push(check("project-config", "error", "项目配置没有通过检查。", error.message));
    }
  }

  const siteDataPath = path.join(projectRoot, "dist", "site-data.json");
  const handoffPath = path.join(projectRoot, "dist", "frontend-handoff.v2.json");
  const siteDataResult = readJsonResult(siteDataPath);
  const handoffResult = readJsonResult(handoffPath);
  if (siteDataResult.state === "missing" || handoffResult.state === "missing") {
    checks.push(check("generated-public-data", "missing", "还缺少可安全预览的生成结果。", "需要 dist/site-data.json 和 dist/frontend-handoff.v2.json；它们只包含公开安全的页面数据与交接约定。"));
  } else if (siteDataResult.state !== "present" || handoffResult.state !== "present") {
    checks.push(check("generated-public-data", "error", "生成结果里有无法读取的 JSON。", "请重新生成项目；preflight 不会修改这些文件。"));
  } else {
    try {
      validateFrontendHandoffV2(handoffResult.value, { siteData: siteDataResult.value });
      invariant(!projectConfig || handoffResult.value.projectId === projectConfig.projectId, "generated handoff belongs to another project.");
      checks.push(check("generated-public-data", "pass", "已有可预览的公开安全页面数据和前端交接文件。"));
    } catch (error) {
      checks.push(check("generated-public-data", "error", "生成结果和项目对不上。", error.message));
    }
  }

  const previewFiles = ["index.html", "styles.css", "app.js"].map((name) => path.join(previewTemplateRoot, name));
  checks.push(previewFiles.every((target) => fs.existsSync(target))
    ? check("bundled-preview", "pass", "内置静态预览已就绪，不需要全局安装预览工具。")
    : check("bundled-preview", "missing", "内置预览文件不完整。", "请修复当前 Silent Orbit 包；preflight 不会联网下载或改系统。"));

  const defaultAgentPaths = [
    path.join(packageRoot, "skills", "customize-skill-cosmos", "SKILL.md"),
    path.join(repositoryRoot, "skills", "customize-skill-cosmos", "SKILL.md"),
  ];
  const selectedAgent = existingFile(normalizeCandidatePaths(agentPaths, defaultAgentPaths));
  checks.push(selectedAgent
    ? check("agent-path", "pass", "已找到可带你完成访谈的个性化 Agent 流程。")
    : check("agent-path", "missing", "没有找到可用的个性化 Agent 路径。", "请明确提供项目或安装包里的 customize-skill-cosmos/SKILL.md；不会扫描其他目录。"));

  const defaultBrowserPaths = [path.join(previewTemplateRoot, "index.html")];
  const selectedBrowser = existingFile(normalizeCandidatePaths(browserPaths, defaultBrowserPaths));
  checks.push(selectedBrowser
    ? check("browser-path", "pass", "已找到可在浏览器打开的本地预览入口。")
    : check("browser-path", "missing", "没有找到可用的浏览器预览入口。", "可以明确提供一个本地浏览器入口；不会安装浏览器或更改默认浏览器。"));

  const onboardingPath = path.join(projectRoot, ...ONBOARDING_FILE.split("/"));
  const onboardingResult = readJsonResult(onboardingPath);
  let onboardingState = onboardingResult.state;
  if (onboardingResult.state === "present") {
    try {
      validateOnboardingConfig(onboardingResult.value, projectId);
      onboardingState = "present";
      checks.push(check("project-onboarding", "pass", "当前项目已经完成个性化启动配置。"));
    } catch (error) {
      onboardingState = "invalid";
      checks.push(check("project-onboarding", "error", "现有个性化启动配置无效。", `${error.message} 为避免覆盖已有内容，需要先人工处理。`));
    }
  } else if (onboardingResult.state === "missing") {
    checks.push(check("project-onboarding", "missing", "当前项目还没有个性化启动配置。", "只需在这个项目里记录一次安全边界和内置预览方式。"));
  } else {
    checks.push(check("project-onboarding", "error", "个性化启动配置不是有效 JSON。", "不会自动覆盖；请先人工处理现有文件。"));
  }

  const blockingChecks = checks.filter((entry) => entry.id !== "project-onboarding" && entry.state !== "pass").map((entry) => entry.id);
  const canSetup = onboardingState === "missing" && rootIsDirectory && blockingChecks.length === 0;
  const token = onboardingState === "missing" ? confirmationToken(projectRoot, projectId) : null;
  const status = blockingChecks.length > 0 || onboardingState === "invalid"
    ? "blocked"
    : onboardingState === "missing"
      ? "needs-consent"
      : "ready";

  return {
    schemaVersion: 3,
    kind: "CustomizationOnboardingPreflightV3",
    status,
    readOnly: true,
    projectId,
    checks,
    blockingChecks,
    canSetup,
    explanation: {
      available: checks.filter((entry) => entry.state === "pass").map((entry) => entry.summary),
      missing: checks.filter((entry) => entry.state !== "pass").map((entry) => entry.summary),
      why: [
        "这些条件让访谈结果能变成可操作、可刷新的本地预览。",
        "页面只读取公开安全的 site-data 和 frontend-handoff，不会读取私人 Skill 正文。",
      ],
      willWrite: onboardingState === "missing" ? [ONBOARDING_FILE] : [],
      willNotWrite: ["全局 Node 或 npm", "系统设置或默认浏览器", "项目外文件", "Skill 内容、会话原文或私人资料"],
    },
    confirmation: canSetup
      ? {
        required: true,
        token,
        prompt: `如果你同意只在当前项目写入 ${ONBOARDING_FILE}，请原样确认 token。`,
      }
      : { required: false, token: null },
  };
}

function assertNoSymlinkAncestors(projectRoot, relativeParts) {
  let current = projectRoot;
  for (const part of relativeParts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    invariant(!fs.lstatSync(current).isSymbolicLink(), `${path.relative(projectRoot, current)} cannot be a symbolic link.`);
  }
}

/** Write the single project-local onboarding sidecar after exact consent. */
export function setupCustomizationOnboardingV3({
  projectDirectory = ".",
  confirmationToken: suppliedToken,
  configuredAt = new Date().toISOString(),
  nodeVersion = process.versions.node,
  agentPaths,
  browserPaths,
} = {}) {
  const before = preflightCustomizationOnboardingV3({ projectDirectory, nodeVersion, agentPaths, browserPaths });
  if (!before.confirmation.required) {
    return { status: before.status, wrote: false, configRelativePath: ONBOARDING_FILE, preflight: before };
  }
  if (suppliedToken !== before.confirmation.token) {
    return { status: "consent-required", wrote: false, configRelativePath: ONBOARDING_FILE, preflight: before };
  }
  if (!before.canSetup) {
    return { status: "blocked", wrote: false, configRelativePath: ONBOARDING_FILE, preflight: before };
  }

  safeTimestamp(configuredAt, "configuredAt");
  const requestedRoot = path.resolve(projectDirectory);
  invariant(fs.statSync(requestedRoot).isDirectory(), "project directory must already exist.");
  const projectRoot = fs.realpathSync(requestedRoot);
  const parts = ONBOARDING_FILE.split("/");
  assertNoSymlinkAncestors(projectRoot, parts);
  const target = path.join(projectRoot, ...parts);
  invariant(isWithin(projectRoot, target), "onboarding config escaped the project root.");
  invariant(!fs.existsSync(target), "onboarding config already exists; refusing to overwrite it.");

  const config = validateOnboardingConfig({
    schemaVersion: 3,
    kind: "CustomizationOnboardingV3",
    projectId: before.projectId,
    configuredAt,
    scope: "project-only",
    preview: { mode: "bundled-static" },
    permissions: {
      globalInstall: false,
      systemConfiguration: false,
      outsideProjectWrites: false,
    },
  }, before.projectId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, stableJson(config), { encoding: "utf8", flag: "wx" });

  const after = preflightCustomizationOnboardingV3({ projectDirectory: projectRoot, nodeVersion, agentPaths, browserPaths });
  return { status: after.status, wrote: true, configRelativePath: ONBOARDING_FILE, config, preflight: after };
}

function questionView(index) {
  const question = QUESTIONS[index];
  if (!question) return null;
  return {
    id: question.id,
    progress: `${index + 1}/${QUESTION_COUNT}`,
    prompt: question.prompt,
    examples: [...question.examples],
    escape: "不确定、回答“我不知道”或直接跳过都可以；我会先采用温和的默认值，之后还能回来改。",
    backHint: index > 0 ? "如果上一题想改，可以返回上一题。" : null,
  };
}

function normalizeInput(response) {
  if (isRecord(response) && response.skip === true) return { text: "", skipped: true };
  const value = isRecord(response) ? response.text : response;
  const text = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  return { text, skipped: text.length === 0 || SKIP_PATTERN.test(text) };
}

function unique(values) {
  return [...new Set(values)];
}

function hasAffirmativeMatch(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const negation = /(?:不喜欢|不想(?:要)?|不要|不需要|不必|无需|不用|避开|讨厌|拒绝|别(?:用|要)?|并非|不是)/u;
  for (const match of text.matchAll(matcher)) {
    const start = match.index ?? 0;
    const prefix = text.slice(0, start);
    const clauseStart = Math.max(prefix.lastIndexOf("。"), prefix.lastIndexOf("！"), prefix.lastIndexOf("？"), prefix.lastIndexOf("；"), prefix.lastIndexOf(";"), prefix.lastIndexOf("，"), prefix.lastIndexOf(","), prefix.lastIndexOf("\n")) + 1;
    const suffix = text.slice(start + match[0].length);
    const nextBoundaries = ["。", "！", "？", "；", ";", "，", ",", "\n"].map((separator) => suffix.indexOf(separator)).filter((index) => index >= 0);
    const clauseEnd = nextBoundaries.length ? start + match[0].length + Math.min(...nextBoundaries) : text.length;
    const nearby = text.slice(Math.max(clauseStart, start - 10), Math.min(clauseEnd, start + match[0].length + 8));
    if (!negation.test(nearby)) return true;
  }
  return false;
}

function normalizedAnswer(questionId, { status, summary, values, confidence, inference }) {
  return { questionId, status, summary, values, confidence, inference };
}

function normalizeReferences(response) {
  const { text, skipped } = normalizeInput(response);
  if (skipped) return normalizedAnswer(QUESTION_IDS[0], {
    status: "skipped", summary: "暂时没有指定参考；先采用清楚、克制的日常页面。", values: { references: ["清楚克制的日常工具"] }, confidence: "low", inference: "没有强行要求你提供设计案例，先使用容易阅读的安全默认值。",
  });
  const references = [];
  if (hasAffirmativeMatch(text, /(?:苹果|apple|产品页|官网)/iu)) references.push("留白清楚的产品介绍页");
  if (hasAffirmativeMatch(text, /(?:无印|muji|日用品|展柜)/iu)) references.push("安静克制的日用品目录");
  const interactiveEditorial = /(?:互动|可互动|会动|动态|预言家日报)/u.test(text)
    && /(?:杂志|报纸|日报|书|出版|画册|哈利波特)/u.test(text);
  if (interactiveEditorial) references.push("像会动的报纸一样可互动的书刊页面");
  else if (/(?:杂志|书|出版|画册)/iu.test(text)) references.push("有阅读节奏的书刊页面");
  if (/(?:星图|地图|宇宙|探索)/iu.test(text)) references.push("可以慢慢探索的空间地图");
  if (/(?:notion|linear|工具|应用|软件)/iu.test(text)) references.push("清楚直接的日常工具");
  const inferred = unique(references).slice(0, 3);
  const uncertain = inferred.length === 0;
  return normalizedAnswer(QUESTION_IDS[0], {
    status: uncertain ? "uncertain" : "answered",
    summary: uncertain ? "你在意熟悉和好用；具体参考可以以后再补。" : `你偏爱${inferred.join("、")}。`,
    values: { references: uncertain ? ["熟悉好用的日常页面"] : inferred },
    confidence: uncertain ? "low" : inferred.length > 1 ? "high" : "medium",
    inference: uncertain ? "回答较含糊，所以只保留了“熟悉、好用”这一层意思。" : interactiveEditorial ? "保留了互动书刊和会动报纸的核心意象，没有保存逐字回答。" : "把生活化的参照概括成页面气质，没有保存逐字回答。",
  });
}

function normalizeAvoid(response) {
  const { text, skipped } = normalizeInput(response);
  if (skipped) return normalizedAnswer(QUESTION_IDS[1], {
    status: "skipped", summary: "暂时没有明确雷区；先避开拥挤和过度装饰。", values: { antiReferences: ["拥挤且过度装饰的界面"] }, confidence: "low", inference: "没有把跳过理解成同意任何风格，而是采用较保守的可读性边界。",
  });
  const avoided = [];
  if (/(?:挤|拥挤|太满|塞满|信息太多)/u.test(text)) avoided.push("没有层次的拥挤页面");
  if (/(?:花哨|霓虹|炫|刺眼|颜色太多)/u.test(text)) avoided.push("抢眼且过度装饰的页面");
  if (/(?:卡片|仪表盘|dashboard|千篇一律)/iu.test(text)) avoided.push("千篇一律的卡片仪表盘");
  if (/(?:动画|晃|一直动|闪)/u.test(text)) avoided.push("持续移动和闪烁的界面");
  const inferred = unique(avoided).slice(0, 3);
  const uncertain = inferred.length === 0;
  return normalizedAnswer(QUESTION_IDS[1], {
    status: uncertain ? "uncertain" : "answered",
    summary: uncertain ? "你有一些顾虑，但暂时没有明确雷区；先避免视觉噪音。" : `会避开${inferred.join("、")}。`,
    values: { antiReferences: uncertain ? ["视觉噪音过多的界面"] : inferred },
    confidence: uncertain ? "low" : "high",
    inference: uncertain ? "没有从模糊回答中猜具体禁忌。" : "只保留了可执行的避雷摘要。",
  });
}

function normalizeFeeling(response) {
  const { text, skipped } = normalizeInput(response);
  if (skipped) return normalizedAnswer(QUESTION_IDS[2], {
    status: "skipped", summary: "整体先做得清楚、可靠、不过分打扰。", values: { qualities: ["清楚", "可靠", "克制"] }, confidence: "low", inference: "在没有明确情绪偏好时，优先保证长期使用的稳定感。",
  });
  const qualities = [];
  if (/(?:安静|平静|冷静|专注)/u.test(text)) qualities.push("安静");
  if (/(?:清楚|清晰|明白|有条理)/u.test(text)) qualities.push("清楚");
  if (/(?:温暖|温柔|亲切|有人味)/u.test(text)) qualities.push("温暖");
  if (/(?:生命|活力|活着|生动)/u.test(text)) qualities.push("有生命力");
  if (/(?:利落|专业|可靠|工具)/u.test(text)) qualities.push("可靠利落");
  if (/(?:轻松|松弛|呼吸)/u.test(text)) qualities.push("松弛");
  const inferred = unique(qualities).slice(0, 3);
  const uncertain = inferred.length === 0;
  return normalizedAnswer(QUESTION_IDS[2], {
    status: uncertain ? "uncertain" : "answered",
    summary: uncertain ? "想要舒服耐用的整体感觉，细节以后再调。" : `整体希望是${inferred.join("、")}的。`,
    values: { qualities: uncertain ? ["舒服", "耐用"] : inferred },
    confidence: uncertain ? "low" : inferred.length > 1 ? "high" : "medium",
    inference: uncertain ? "只概括成不容易出错的日常感受。" : "把对房间般的描述整理成简短气质词。",
  });
}

function normalizeFindThings(response) {
  const { text, skipped } = normalizeInput(response);
  if (skipped) return normalizedAnswer(QUESTION_IDS[3], {
    status: "skipped", summary: "先让目录和地图同样可达，内容量保持适中。", values: { density: "balanced", navigation: "balanced" }, confidence: "low", inference: "没有偏好时不替你强行选择入口。",
  });
  const libraryTerms = /(?:目录|列表|搜索|查找|找东西)/u;
  const mapTerms = /(?:地图|星图|关系图|探索|逛|关联)/u;
  const priorityTerms = /(?:先|优先|首先|首次|默认|第一眼)/u;
  const libraryPriority = hasAffirmativeMatch(text, /(?:先|优先|首先|首次|默认|第一眼)[^。；;，,]{0,16}(?:目录|列表|搜索|查找)|(?:目录|列表|搜索|查找)[^。；;，,]{0,10}(?:先|优先|首先|默认)/u);
  const mapPriority = hasAffirmativeMatch(text, /(?:先|优先|首先|首次|默认|第一眼)[^。；;，,]{0,16}(?:地图|星图|关系图|探索)|(?:地图|星图|关系图|探索)[^。；;，,]{0,10}(?:先|优先|首先|默认)/u);
  const balancedPreference = /(?:目录|列表)[^。；;]{0,20}(?:地图|星图|关系图)[^。；;]{0,16}(?:都可以|都行|均可|同样|一样|没有先后)|(?:地图|星图|关系图)[^。；;]{0,20}(?:目录|列表)[^。；;]{0,16}(?:都可以|都行|均可|同样|一样|没有先后)|(?:两种|两个)(?:都可以|都行|均可|同样|一样)/u.test(text);
  const navigation = mapPriority && !libraryPriority
    ? "map-first"
    : libraryPriority && !mapPriority
      ? "library-first"
      : balancedPreference && !priorityTerms.test(text)
        ? "balanced"
        : libraryTerms.test(text) && !mapTerms.test(text)
          ? "library-first"
          : mapTerms.test(text) && !libraryTerms.test(text)
            ? "map-first"
            : /(?:知道.*找|明确.*找)/u.test(text)
              ? "library-first"
              : "balanced";
  const density = /(?:紧凑|多放|一屏|效率|密一点)/u.test(text)
    ? "compact"
    : /(?:留白|少一点|别太挤|宽松|慢慢)/u.test(text)
      ? "airy"
      : "balanced";
  const recognized = navigation !== "balanced" || density !== "balanced" || /(?:两种|适中|均衡)/u.test(text);
  const navigationText = navigation === "library-first" ? "首次打开先看目录" : navigation === "map-first" ? "首次打开先看关系图" : "目录和关系图同样方便";
  const densityText = density === "compact" ? "一屏多放一些内容" : density === "airy" ? "内容之间多留空间" : "内容量保持适中";
  return normalizedAnswer(QUESTION_IDS[3], {
    status: recognized ? "answered" : "uncertain",
    summary: `${navigationText}；${densityText}。`,
    values: { density, navigation },
    confidence: recognized ? "high" : "low",
    inference: recognized ? "把日常找东西的习惯转换成默认入口和页面疏密。" : "回答没有明显倾向，所以两种入口都保留为同等优先。",
  });
}

function normalizeReadingSurface(response) {
  const { text, skipped } = normalizeInput(response);
  if (skipped) return normalizedAnswer(QUESTION_IDS[4], {
    status: "skipped", summary: "文字先用亲切耐读的方式，颜色保持克制。", values: { typography: "humanist", colorIntent: ["克制的中性色", "清楚的重点色"], highContrast: false }, confidence: "low", inference: "没有要求你选择字体或色板，先采用耐读默认值。",
  });
  const typography = /(?:书|杂志|出版|阅读|文章)/u.test(text)
    ? "editorial"
    : /(?:代码|终端|工具|理性|精确|黑白分明)/u.test(text)
      ? "technical"
      : "humanist";
  const colors = [];
  if (/(?:黑白|单色|克制|低饱和)/u.test(text)) colors.push("克制的黑白与低饱和色");
  if (/(?:柔和|温暖|自然|米色)/u.test(text)) colors.push("柔和温暖的底色");
  if (/(?:深色|暗色|夜间)/u.test(text)) colors.push("舒适的深色底面");
  const highContrast = hasAffirmativeMatch(text, /(?:高对比|分明|看清|醒目)/u);
  if (highContrast) colors.push("清楚的高对比重点");
  const recognized = colors.length > 0 || typography !== "humanist" || /(?:亲切|圆润|有人味)/u.test(text);
  return normalizedAnswer(QUESTION_IDS[4], {
    status: recognized ? "answered" : "uncertain",
    summary: `${typography === "editorial" ? "文字像书刊一样有阅读节奏" : typography === "technical" ? "文字像工具一样清楚利落" : "文字亲切耐读"}；颜色${colors.length ? colors.join("、") : "先保持克制"}。`,
    values: { typography, colorIntent: colors.length ? unique(colors) : ["克制的中性色", "单一重点色"], highContrast },
    confidence: recognized ? "medium" : "low",
    inference: recognized ? "从纸张和阅读感的描述推断文字气质与颜色意图。" : "没有猜具体字体或色号，只使用耐读默认值。",
  });
}

function normalizeComfort(response) {
  const { text, skipped } = normalizeInput(response);
  if (skipped) return normalizedAnswer(QUESTION_IDS[5], {
    status: "skipped", summary: "动效保持轻微；电脑和手机同等照顾。", values: { motion: "measured", reducedMotion: false, highContrast: false, mobilePriority: "equal" }, confidence: "low", inference: "没有明确需求时，保留温和反馈并兼顾大小屏。",
  });
  const still = /(?:不动|少动|不要动画|晕|敏感|分心|关闭动画)/u.test(text);
  const expressive = !still && /(?:活泼|明显动画|多一点动画|有动感)/u.test(text);
  const motion = still ? "still" : expressive ? "expressive" : "measured";
  const excludesMobile = /(?:完全|基本|几乎|平时|从来)?(?:不(?:会|再)?|没(?:有)?)(?:怎么|太)?用手机|不用手机|只用(?:电脑|桌面端|大屏)|手机(?:不使用|不用|不是.*场景)/u.test(text);
  const mobilePriority = excludesMobile
    ? "desktop-led"
    : /(?:手机优先|主要.*手机|大多.*手机|小屏优先)/u.test(text)
    ? "essential"
    : /(?:电脑优先|主要.*电脑|桌面优先|大屏)/u.test(text)
      ? "desktop-led"
      : "equal";
  const highContrast = hasAffirmativeMatch(text, /(?:高对比|看不清|视力|颜色分明)/u);
  const recognized = still || expressive || mobilePriority !== "equal" || highContrast || /(?:一点|自然|反馈|两边)/u.test(text);
  return normalizedAnswer(QUESTION_IDS[5], {
    status: recognized ? "answered" : "uncertain",
    summary: `${motion === "still" ? "尽量不使用动画" : motion === "expressive" ? "可以有较明显但可控的动画" : "只使用轻微自然的反馈"}；${mobilePriority === "essential" ? "手机体验优先" : excludesMobile ? "以电脑体验为主，手机不是你的使用场景" : mobilePriority === "desktop-led" ? "电脑体验优先，手机不是主要场景" : "电脑和手机同等照顾"}${highContrast ? "；需要更清楚的对比" : ""}。`,
    values: { motion, reducedMotion: still, highContrast, mobilePriority },
    confidence: recognized ? "high" : "low",
    inference: recognized ? "把舒服程度转换成动效、对比度和设备优先级。" : "没有从含糊回答中扩大无障碍需求。",
  });
}

const NORMALIZERS = Object.freeze([
  normalizeReferences,
  normalizeAvoid,
  normalizeFeeling,
  normalizeFindThings,
  normalizeReadingSurface,
  normalizeComfort,
]);

function validateInterviewState(state) {
  assertExactKeys(state, ["schemaVersion", "kind", "locale", "profileId", "createdAt", "updatedAt", "cursor", "answers"], "interview state");
  invariant(state.schemaVersion === 3 && state.kind === "CustomizationInterviewV3", "interview state is invalid.");
  invariant(state.locale === "zh-CN", "only the zh-CN beginner interview is supported.");
  invariant(/^[a-z0-9][a-z0-9.-]{0,71}$/u.test(state.profileId), "interview profile id is invalid.");
  safeTimestamp(state.createdAt, "interview createdAt");
  safeTimestamp(state.updatedAt, "interview updatedAt");
  invariant(Number.isInteger(state.cursor) && state.cursor >= 0 && state.cursor <= QUESTION_COUNT, "interview cursor is invalid.");
  invariant(isRecord(state.answers), "interview answers are invalid.");
  invariant(Object.keys(state.answers).every((key) => QUESTION_IDS.includes(key)), "interview answers contain an unknown question.");
  for (const [questionId, answer] of Object.entries(state.answers)) validateNormalizedAnswer(questionId, answer);
  return state;
}

function validateNormalizedAnswer(questionId, answer) {
  assertExactKeys(answer, ["questionId", "status", "summary", "values", "confidence", "inference"], `answer ${questionId}`);
  invariant(answer.questionId === questionId, `answer ${questionId} identity is invalid.`);
  invariant(new Set(["answered", "uncertain", "skipped"]).has(answer.status), `answer ${questionId} status is invalid.`);
  safeShortString(answer.summary, `answer ${questionId} summary`);
  safeShortString(answer.inference, `answer ${questionId} inference`);
  invariant(new Set(["low", "medium", "high"]).has(answer.confidence), `answer ${questionId} confidence is invalid.`);
  if (questionId === QUESTION_IDS[0]) {
    assertExactKeys(answer.values, ["references"], `answer ${questionId} values`);
    safeStringList(answer.values.references, `answer ${questionId} references`);
  } else if (questionId === QUESTION_IDS[1]) {
    assertExactKeys(answer.values, ["antiReferences"], `answer ${questionId} values`);
    safeStringList(answer.values.antiReferences, `answer ${questionId} antiReferences`);
  } else if (questionId === QUESTION_IDS[2]) {
    assertExactKeys(answer.values, ["qualities"], `answer ${questionId} values`);
    safeStringList(answer.values.qualities, `answer ${questionId} qualities`);
  } else if (questionId === QUESTION_IDS[3]) {
    assertExactKeys(answer.values, ["density", "navigation"], `answer ${questionId} values`);
    invariant(new Set(["compact", "balanced", "airy"]).has(answer.values.density), `answer ${questionId} density is invalid.`);
    invariant(new Set(["map-first", "library-first", "balanced"]).has(answer.values.navigation), `answer ${questionId} navigation is invalid.`);
  } else if (questionId === QUESTION_IDS[4]) {
    assertExactKeys(answer.values, ["typography", "colorIntent", "highContrast"], `answer ${questionId} values`);
    invariant(new Set(["editorial", "technical", "humanist"]).has(answer.values.typography), `answer ${questionId} typography is invalid.`);
    safeStringList(answer.values.colorIntent, `answer ${questionId} colorIntent`);
    invariant(typeof answer.values.highContrast === "boolean", `answer ${questionId} highContrast is invalid.`);
  } else if (questionId === QUESTION_IDS[5]) {
    assertExactKeys(answer.values, ["motion", "reducedMotion", "highContrast", "mobilePriority"], `answer ${questionId} values`);
    invariant(new Set(["still", "measured", "expressive"]).has(answer.values.motion), `answer ${questionId} motion is invalid.`);
    invariant(typeof answer.values.reducedMotion === "boolean" && typeof answer.values.highContrast === "boolean", `answer ${questionId} accessibility values are invalid.`);
    invariant(new Set(["essential", "equal", "desktop-led"]).has(answer.values.mobilePriority), `answer ${questionId} mobile priority is invalid.`);
  }
  return answer;
}

function preferencesFromState(state) {
  validateInterviewState(state);
  invariant(QUESTION_IDS.every((id) => isRecord(state.answers[id])), "all six interview questions must be answered or skipped before review.");
  const references = state.answers[QUESTION_IDS[0]].values.references;
  const antiReferences = state.answers[QUESTION_IDS[1]].values.antiReferences;
  const qualities = state.answers[QUESTION_IDS[2]].values.qualities;
  const findThings = state.answers[QUESTION_IDS[3]].values;
  const reading = state.answers[QUESTION_IDS[4]].values;
  const comfort = state.answers[QUESTION_IDS[5]].values;
  return {
    references: [...references],
    antiReferences: [...antiReferences],
    qualities: [...qualities],
    density: findThings.density,
    navigation: findThings.navigation,
    typography: reading.typography,
    colorIntent: [...reading.colorIntent],
    motion: comfort.motion,
    accessibility: {
      highContrast: reading.highContrast || comfort.highContrast,
      reducedMotion: comfort.reducedMotion,
      mobilePriority: comfort.mobilePriority,
    },
  };
}

export function createCustomizationInterviewV3({
  profileId = "personal-aesthetic",
  createdAt = new Date().toISOString(),
} = {}) {
  safeTimestamp(createdAt, "createdAt");
  const state = {
    schemaVersion: 3,
    kind: "CustomizationInterviewV3",
    locale: "zh-CN",
    profileId: portableId(profileId),
    createdAt,
    updatedAt: createdAt,
    cursor: 0,
    answers: {},
  };
  return { state, status: "question", question: questionView(0) };
}

export function getCustomizationInterviewStepV3(state, { advanced = false } = {}) {
  validateInterviewState(state);
  if (state.cursor < QUESTION_COUNT) return { status: "question", question: questionView(state.cursor) };
  return { status: "review", review: reviewCustomizationInterviewV3(state, { advanced }) };
}

export function answerCustomizationInterviewV3(state, response, { answeredAt = new Date().toISOString() } = {}) {
  validateInterviewState(state);
  invariant(state.cursor < QUESTION_COUNT, "interview is already ready for review; go back to change an answer.");
  safeTimestamp(answeredAt, "answeredAt");
  const next = structuredClone(state);
  const questionId = QUESTION_IDS[next.cursor];
  next.answers[questionId] = NORMALIZERS[next.cursor](response);
  next.cursor += 1;
  next.updatedAt = answeredAt;
  return { state: next, ...getCustomizationInterviewStepV3(next) };
}

export function backCustomizationInterviewV3(state, { changedAt = new Date().toISOString() } = {}) {
  validateInterviewState(state);
  safeTimestamp(changedAt, "changedAt");
  const next = structuredClone(state);
  next.cursor = Math.max(0, next.cursor - 1);
  next.updatedAt = changedAt;
  return { state: next, changed: state.cursor !== next.cursor, status: "question", question: questionView(next.cursor) };
}

export function reviewCustomizationInterviewV3(state, { advanced = false } = {}) {
  const preferences = preferencesFromState(state);
  const navigation = preferences.navigation === "library-first" ? "首次打开先到目录" : preferences.navigation === "map-first" ? "首次打开先到关系图" : "目录和关系图同等优先";
  const density = preferences.density === "airy" ? "页面会多留一些呼吸空间" : preferences.density === "compact" ? "一屏会放更多内容" : "页面内容量适中";
  const motion = preferences.motion === "still" ? "尽量保持安静不动" : preferences.motion === "expressive" ? "允许更明显但可控的动态" : "只保留轻微、自然的反馈";
  const review = {
    schemaVersion: 3,
    kind: "CustomizationInterviewReviewV3",
    title: "我理解的是……",
    summary: [
      `你喜欢：${preferences.references.join("、")}。`,
      `你想避开：${preferences.antiReferences.join("、")}。`,
      `这个空间应该让人感到：${preferences.qualities.join("、")}。`,
      `${navigation}；${density}。`,
      `文字会以容易长时间阅读为先，颜色方向是：${preferences.colorIntent.join("、")}。`,
      `${motion}；${preferences.accessibility.mobilePriority === "essential" ? "手机优先" : preferences.accessibility.mobilePriority === "desktop-led" ? "电脑端优先，手机不是主要使用场景" : "电脑和手机同等照顾"}。`,
    ],
    canModify: true,
    nextAction: "你可以确认，也可以返回任意上一题修改。",
  };
  if (advanced) review.advanced = { label: "高级信息", preferences };
  return review;
}

export function confirmCustomizationInterviewV3(state, {
  confirmedAt = new Date().toISOString(),
  existingProfile = null,
} = {}) {
  safeTimestamp(confirmedAt, "confirmedAt");
  const preferences = preferencesFromState(state);
  let profileId = state.profileId;
  let revision = 1;
  let createdAt = state.createdAt;
  if (existingProfile) {
    validateDesignProfileV2(existingProfile);
    invariant(existingProfile.profileId === state.profileId, "existing profile id does not match the interview.");
    profileId = existingProfile.profileId;
    revision = existingProfile.revision + 1;
    createdAt = existingProfile.createdAt;
  }
  const profile = validateDesignProfileV2({
    schemaVersion: 2,
    kind: "DesignProfileV2",
    profileId,
    revision,
    createdAt,
    updatedAt: confirmedAt,
    preferences,
  });
  const inferences = QUESTION_IDS.map((questionId) => {
    const answer = state.answers[questionId];
    return {
      questionId,
      conclusion: answer.summary,
      explanation: answer.inference,
      confidence: answer.confidence,
    };
  });
  return {
    schemaVersion: 3,
    kind: "CustomizationInterviewConfirmationV3",
    profile,
    inferences,
    review: reviewCustomizationInterviewV3(state),
  };
}

function projectLocalTarget(projectDirectory, relativePath, label) {
  const projectRoot = fs.realpathSync(path.resolve(projectDirectory));
  invariant(fs.statSync(projectRoot).isDirectory(), "project directory must exist.");
  const parts = relativePath.split("/");
  assertNoSymlinkAncestors(projectRoot, parts);
  const target = path.join(projectRoot, ...parts);
  invariant(isWithin(projectRoot, target), `${label} escaped the project root.`);
  return target;
}

function requireProjectOnboarding(projectDirectory) {
  const projectRoot = fs.realpathSync(path.resolve(projectDirectory));
  const config = validateSilentOrbitConfigV1(JSON.parse(fs.readFileSync(path.join(projectRoot, "silent-orbit.config.json"), "utf8")));
  const onboardingTarget = projectLocalTarget(projectRoot, ONBOARDING_FILE, "onboarding config");
  const onboarding = readJsonResult(onboardingTarget);
  invariant(onboarding.state === "present", "project onboarding must be present before interview data can be written.");
  validateOnboardingConfig(onboarding.value, config.project.projectId);
  return projectRoot;
}

function validateInterviewReview(review) {
  assertExactKeys(review, ["schemaVersion", "kind", "title", "summary", "canModify", "nextAction"], "interview review");
  invariant(review.schemaVersion === 3 && review.kind === "CustomizationInterviewReviewV3", "interview review identity is invalid.");
  safeShortString(review.title, "interview review title", 80);
  safeStringList(review.summary, "interview review summary", { min: QUESTION_COUNT, max: QUESTION_COUNT });
  invariant(review.canModify === true, "interview review must remain modifiable.");
  safeShortString(review.nextAction, "interview review next action", 240);
  return review;
}

function validateInterviewConfirmation(confirmation) {
  assertExactKeys(confirmation, ["schemaVersion", "kind", "profile", "inferences", "review"], "interview confirmation");
  invariant(confirmation.schemaVersion === 3 && confirmation.kind === "CustomizationInterviewConfirmationV3", "interview confirmation is invalid.");
  validateDesignProfileV2(confirmation.profile);
  invariant(Array.isArray(confirmation.inferences) && confirmation.inferences.length === QUESTION_COUNT, "interview confirmation inferences are invalid.");
  confirmation.inferences.forEach((inference, index) => {
    assertExactKeys(inference, ["questionId", "conclusion", "explanation", "confidence"], `interview confirmation inference ${index}`);
    invariant(inference.questionId === QUESTION_IDS[index], `interview confirmation inference ${index} identity is invalid.`);
    safeShortString(inference.conclusion, `interview confirmation inference ${index} conclusion`);
    safeShortString(inference.explanation, `interview confirmation inference ${index} explanation`);
    invariant(new Set(["low", "medium", "high"]).has(inference.confidence), `interview confirmation inference ${index} confidence is invalid.`);
  });
  validateInterviewReview(confirmation.review);
  return confirmation;
}

export function loadCustomizationInterviewV3({ projectDirectory = "." } = {}) {
  const target = projectLocalTarget(projectDirectory, INTERVIEW_FILE, "interview state");
  if (!fs.existsSync(target)) return null;
  return validateInterviewState(JSON.parse(fs.readFileSync(target, "utf8")));
}

export function persistCustomizationInterviewV3({ projectDirectory = ".", state } = {}) {
  requireProjectOnboarding(projectDirectory);
  const validated = validateInterviewState(structuredClone(state));
  const target = projectLocalTarget(projectDirectory, INTERVIEW_FILE, "interview state");
  atomicWriteJson(target, validated);
  const staleConfirmation = projectLocalTarget(projectDirectory, INTERVIEW_CONFIRMATION_FILE, "interview confirmation");
  if (fs.existsSync(staleConfirmation)) fs.rmSync(staleConfirmation, { force: true, maxRetries: 3, retryDelay: 50 });
  return validated;
}

export function loadCustomizationInterviewConfirmationV3({ projectDirectory = "." } = {}) {
  const target = projectLocalTarget(projectDirectory, INTERVIEW_CONFIRMATION_FILE, "interview confirmation");
  if (!fs.existsSync(target)) return null;
  return validateInterviewConfirmation(JSON.parse(fs.readFileSync(target, "utf8")));
}

export function persistCustomizationInterviewConfirmationV3({ projectDirectory = ".", confirmation } = {}) {
  requireProjectOnboarding(projectDirectory);
  const validated = validateInterviewConfirmation(structuredClone(confirmation));
  const target = projectLocalTarget(projectDirectory, INTERVIEW_CONFIRMATION_FILE, "interview confirmation");
  atomicWriteJson(target, validated);
  return validated;
}

function directionId(profileId, variant, suffix) {
  const tail = `-${variant}-${suffix}`;
  invariant(tail.length < 72, "direction suffix is too long.");
  const available = 72 - tail.length;
  const prefix = portableId(profileId).slice(0, available).replace(/[-.]+$/u, "") || "personal";
  return `${prefix}${tail}`;
}

export function createCustomizationDirectionSpecsV2(profile, { generation = 1 } = {}) {
  validateDesignProfileV2(profile);
  invariant(Number.isSafeInteger(generation) && generation >= 1, "direction generation must be a positive safe integer.");
  const preferences = profile.preferences;
  const firstLayout = preferences.navigation === "map-first" ? "signal-grid" : "editorial-rail";
  const secondLayout = firstLayout === "signal-grid" ? "editorial-rail" : "signal-grid";
  const firstDensity = preferences.density;
  const secondDensity = firstDensity === "compact" ? "airy" : "compact";
  const firstTypography = preferences.typography;
  const secondTypography = firstTypography === "technical" ? "editorial" : "technical";
  const firstMotion = preferences.accessibility.reducedMotion ? "still" : preferences.motion;
  const secondMotion = preferences.accessibility.reducedMotion ? "still" : firstMotion === "still" ? "measured" : "still";
  const firstShape = preferences.typography === "humanist" ? "soft" : "square";
  const secondShape = firstShape === "soft" ? "square" : "soft";
  const suffix = `r${profile.revision}-g${generation}`;
  const highContrast = preferences.accessibility.highContrast;
  const navigationRationale = preferences.navigation === "library-first" ? "先回应你从目录找东西的习惯" : preferences.navigation === "map-first" ? "先回应你沿关系探索的习惯" : "让目录和探索保持平衡";
  return [
    {
      id: directionId(profile.profileId, "calm", suffix),
      label: "安静日常",
      rationale: `${navigationRationale}，并把${preferences.qualities.join("、")}变成长时间使用也舒服的页面。`,
      layout: firstLayout,
      density: firstDensity,
      typography: firstTypography,
      motion: firstMotion,
      shape: firstShape,
      palette: highContrast
        ? { paper: "#ffffff", ink: "#050505", muted: "#4f4f4f", line: "#b8b8b8", accent: "#005fcc" }
        : { paper: "#f7f5ef", ink: "#171714", muted: "#65635c", line: "#d6d1c5", accent: "#396a61" },
    },
    {
      id: directionId(profile.profileId, "signal", suffix),
      label: "清晰信号",
      rationale: `用另一种组织节奏验证你的偏好，同时继续避开${preferences.antiReferences.join("、")}。`,
      layout: secondLayout,
      density: secondDensity,
      typography: secondTypography,
      motion: secondMotion,
      shape: secondShape,
      palette: highContrast
        ? { paper: "#0b0c0e", ink: "#ffffff", muted: "#c9cdd3", line: "#69717d", accent: "#ffcc00" }
        : { paper: "#f2f4f7", ink: "#111820", muted: "#586574", line: "#c4ccd5", accent: "#b44b2a" },
    },
  ];
}

export const customizationOnboardingFiles = Object.freeze({
  onboarding: ONBOARDING_FILE,
  interview: INTERVIEW_FILE,
  confirmation: INTERVIEW_CONFIRMATION_FILE,
});
