import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeSilentOrbitProject,
  generateSilentOrbitProject,
  importSilentOrbitSource,
  initSilentOrbitProject,
  scanSilentOrbitProject,
} from "./lib/silent-orbit-project.mjs";
import {
  answerCustomizationInterviewV3,
  confirmCustomizationInterviewV3,
  createCustomizationDirectionSpecsV2,
  createCustomizationInterviewV3,
  persistCustomizationInterviewConfirmationV3,
  persistCustomizationInterviewV3,
  preflightCustomizationOnboardingV3,
  setupCustomizationOnboardingV3,
} from "./lib/customization-onboarding.mjs";
import {
  decideSkillCosmosCustomizationV2,
  prepareSkillCosmosCustomizationV2,
} from "./lib/skill-cosmos-customization.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "silent-orbit-customization-browser-"));
const profileRoot = path.join(temporaryRoot, "chrome-profile");
const requestedDarkScreenshot = process.env.SILENT_ORBIT_BROWSER_SCREENSHOT
  ? path.resolve(process.env.SILENT_ORBIT_BROWSER_SCREENSHOT)
  : null;
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (Number.parseInt(process.versions.node.split(".")[0], 10) !== 24) throw new Error("Customization browser smoke requires Node 24.");
if (!chromePath) throw new Error("Chrome/Chromium was not found in a known local path; set CHROME_PATH without installing anything globally.");

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceImport() {
  const skills = [
    ["calendar-weaver", "Calendar planning"],
    ["meeting-pathfinder", "Meeting preparation"],
    ["research-compass", "Research sources"],
    ["citation-checker", "Citation review"],
    ["image-studio", "Image making"],
    ["document-maker", "Document creation"],
  ].map(([name, description]) => ({
    name,
    visibility: "public",
    origin: "third-party",
    description,
    trigger: `$${name}`,
  }));
  return {
    schemaVersion: 1,
    source: { key: "browser-smoke", label: "Browser Smoke", providerKind: "json-import", updateChannel: "unknown" },
    skills,
  };
}

function buildCustomizedProject(name, navigationAnswer) {
  const parent = path.join(temporaryRoot, name);
  const project = path.join(parent, "project");
  const input = path.join(parent, "public-sample.json");
  fs.mkdirSync(parent, { recursive: true });
  initSilentOrbitProject({ projectDirectory: project, title: `Browser ${name}`, projectId: `browser-${name}` });
  writeJson(input, sourceImport());
  importSilentOrbitSource({ projectDirectory: project, inputFile: input });
  scanSilentOrbitProject({ projectDirectory: project, generatedAt: "2026-08-03T10:00:00.000Z" });
  analyzeSilentOrbitProject({ projectDirectory: project });
  generateSilentOrbitProject({ projectDirectory: project });

  const preflight = preflightCustomizationOnboardingV3({ projectDirectory: project, nodeVersion: process.versions.node });
  assert.equal(preflight.status, "needs-consent");
  const setup = setupCustomizationOnboardingV3({
    projectDirectory: project,
    confirmationToken: preflight.confirmation.token,
    configuredAt: "2026-08-03T10:01:00.000Z",
    nodeVersion: process.versions.node,
  });
  assert.equal(setup.status, "ready");

  const answers = [
    "像一本可互动的杂志，也像会动的报纸。",
    "不要一屏塞得太满，也不要一直闪。",
    "利落、可靠，像一件好用的工具。",
    navigationAnswer,
    "像清楚的工具界面，黑白分明，也亲切圆润，颜色柔和。",
    "可以有一点自然反馈，但别一直动。",
  ];
  let interview = createCustomizationInterviewV3({ profileId: `browser-${name}-aesthetic`, createdAt: "2026-08-03T10:02:00.000Z" });
  persistCustomizationInterviewV3({ projectDirectory: project, state: interview.state });
  answers.forEach((answer, index) => {
    interview = answerCustomizationInterviewV3(interview.state, answer, { answeredAt: `2026-08-03T10:0${index + 3}:00.000Z` });
    persistCustomizationInterviewV3({ projectDirectory: project, state: interview.state });
  });
  const confirmation = confirmCustomizationInterviewV3(interview.state, { confirmedAt: "2026-08-03T10:10:00.000Z" });
  persistCustomizationInterviewConfirmationV3({ projectDirectory: project, confirmation });
  const directions = createCustomizationDirectionSpecsV2(confirmation.profile);
  const prepared = prepareSkillCosmosCustomizationV2({
    projectDirectory: project,
    request: { schemaVersion: 2, generatedAt: "2026-08-03T10:11:00.000Z", profile: confirmation.profile, directions },
  });
  const kept = decideSkillCosmosCustomizationV2({
    projectDirectory: project,
    request: { schemaVersion: 2, generatedAt: "2026-08-03T10:12:00.000Z", action: "keep", directionId: prepared.directions[0].id, feedback: ["用于浏览器默认入口回归。"] },
  });
  assert.equal(kept.current.directionId, prepared.directions[0].id);
  return {
    current: path.join(project, "customization", "current"),
    dark: path.join(project, ...prepared.directions[1].previewDirectory.split("/")),
    preferredView: prepared.directions[0].preferredView,
    experience: JSON.parse(fs.readFileSync(path.join(project, "customization", "current", "customization-experience.v3.json"), "utf8")),
    darkExperience: JSON.parse(fs.readFileSync(path.join(project, ...prepared.directions[1].previewDirectory.split("/"), "customization-experience.v3.json"), "utf8")),
  };
}

function contentType(target) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2" })[path.extname(target).toLowerCase()] ?? "application/octet-stream";
}

function startStaticServer(roots) {
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const [, key, ...parts] = decodeURIComponent(url.pathname).split("/");
      const root = roots[key];
      if (!root) return response.writeHead(404).end("not found");
      const relative = parts.filter(Boolean).join("/") || "index.html";
      const target = path.resolve(root, relative);
      if (path.relative(root, target).startsWith("..") || !fs.existsSync(target) || !fs.statSync(target).isFile()) return response.writeHead(404).end("not found");
      response.writeHead(200, { "content-type": contentType(target), "cache-control": "no-store" });
      fs.createReadStream(target).pipe(response);
    } catch {
      response.writeHead(400).end("bad request");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function getJson(url, attempts = 120) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function computedContrastExpression(selector) {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return 0;
    const parse = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (rgb) => { const c = rgb.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
    const style = getComputedStyle(element); const foreground = parse(style.color); let background = parse(style.backgroundColor);
    if (background.length < 3 || style.backgroundColor === 'rgba(0, 0, 0, 0)') background = parse(getComputedStyle(document.body).backgroundColor);
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05);
  })()`;
}

let staticServer;
let chrome;
let socket;
const pending = new Map();
const browserIssues = [];
let messageId = 0;

function rejectPending(error) {
  for (const [id, promise] of pending) {
    clearTimeout(promise.timer);
    promise.reject(error);
    pending.delete(id);
  }
}

function cdp(method, params = {}) {
  messageId += 1;
  const id = messageId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 15_000);
    pending.set(id, {
      timer,
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label, attempts = 120) {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
}

async function navigate(url) {
  await cdp("Page.navigate", { url });
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#app'))", `load ${url}`);
}

try {
  const library = buildCustomizedProject("library", "我通常知道要找什么，首次打开先给我目录；关系图以后再逛。");
  const map = buildCustomizedProject("map", "我先看关系图，喜欢顺着关联探索；目录作为备用。");
  assert.equal(library.preferredView, "library");
  assert.equal(map.preferredView, "map");
  staticServer = await startStaticServer({ library: library.current, dark: library.dark, map: map.current });
  const address = staticServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  const debugPort = await freePort();
  fs.mkdirSync(profileRoot, { recursive: true });
  chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--window-size=1440,1000", `--user-data-dir=${profileRoot}`,
    "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${debugPort}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  const targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
  const target = targets.find((entry) => entry.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target is unavailable.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") browserIssues.push(message.params?.exceptionDetails?.text ?? "runtime exception");
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) browserIssues.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(" ") ?? "console error");
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") browserIssues.push(message.params.entry.text ?? "browser log error");
    if (message.id && pending.has(message.id)) {
      const promise = pending.get(message.id); pending.delete(message.id);
      if (message.error) promise.reject(new Error(message.error.message)); else promise.resolve(message.result);
    }
  });
  socket.addEventListener("close", () => rejectPending(new Error("Chrome debugger connection closed.")));
  socket.addEventListener("error", () => rejectPending(new Error("Chrome debugger connection failed.")));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome debugger WebSocket handshake timed out.")), 15_000);
    const settle = (callback) => (event) => { clearTimeout(timer); callback(event); };
    socket.addEventListener("open", settle(resolve), { once: true });
    socket.addEventListener("error", settle(() => reject(new Error("Chrome debugger WebSocket handshake failed."))), { once: true });
    socket.addEventListener("close", settle(() => reject(new Error("Chrome debugger WebSocket closed before opening."))), { once: true });
  });
  await Promise.all([cdp("Page.enable"), cdp("Runtime.enable"), cdp("Log.enable")]);

  await navigate(`${base}/library/`);
  await waitFor("document.querySelector('#app')?.dataset.view === 'library'", "library-first initial view");
  assert.equal(await evaluate("location.hash"), "");
  await evaluate("document.querySelector('[data-view-target=map]').click(); true");
  await waitFor("document.querySelector('#app')?.dataset.view === 'map' && location.hash === '#view=map'", "explicit runtime map switch");
  await cdp("Page.reload", { ignoreCache: true });
  await waitFor("document.readyState === 'complete' && document.querySelector('#app')?.dataset.view === 'map'", "runtime switch survives refresh");
  await navigate(`${base}/library/`);
  await waitFor("document.querySelector('#app')?.dataset.view === 'library'", "preferred library restored without explicit URL");
  await evaluate("dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); true");
  await waitFor("document.activeElement?.id === 'search'", "keyboard search focus");
  await evaluate("document.querySelector('#locale-toggle').click(); true");
  await waitFor("document.documentElement.lang === 'en-US'", "English toggle");

  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${base}/library/`);
  await waitFor("document.querySelector('#app')?.dataset.view === 'library'", "390px library-first view");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= 390"), true, "390px preview must not overflow horizontally");
  await cdp("Emulation.clearDeviceMetricsOverride");

  await navigate(`${base}/map/`);
  await waitFor("document.querySelector('#app')?.dataset.view === 'map'", "map-first initial view");
  const focusGroup = map.experience.structure.groups[0];
  const visibleNodeIds = new Set(map.experience.structure.nodes.filter((node) => focusGroup.skillNames.includes(node.skillName)).map((node) => node.id));
  const expectedEdgeIds = map.experience.structure.edges.filter((edge) => visibleNodeIds.has(edge.target)).map((edge) => edge.id).sort();
  await navigate(`${base}/map/#view=map&focus=${encodeURIComponent(focusGroup.id)}`);
  await waitFor(`document.querySelectorAll('[data-edge-id]').length === ${expectedEdgeIds.length}`, "configured topology edges render");
  const renderedEdgeIds = await evaluate("[...document.querySelectorAll('[data-edge-id]')].map((edge) => edge.dataset.edgeId).sort()");
  assert.deepEqual(renderedEdgeIds, expectedEdgeIds, "rendered edges must come from customization-experience.v3.json");
  await navigate(`${base}/map/#view=library`);
  await waitFor("document.querySelector('#app')?.dataset.view === 'library'", "explicit URL overrides map preference");

  await navigate(`${base}/dark/`);
  await waitFor("document.querySelector('#app')?.dataset.view === 'library'", "dark direction load");
  const bodyContrast = await evaluate(computedContrastExpression("body"));
  const listContrast = await evaluate(computedContrastExpression(".list-panel"));
  assert.ok(bodyContrast >= 4.5, `dark body contrast was ${bodyContrast}`);
  assert.ok(listContrast >= 4.5, `dark list contrast was ${listContrast}`);
  if (requestedDarkScreenshot) {
    const darkFocus = library.darkExperience.structure.groups[0].id;
    await navigate(`${base}/dark/#view=map&focus=${encodeURIComponent(darkFocus)}`);
    await waitFor("document.querySelector('#app')?.dataset.view === 'map' && Boolean(document.querySelector('.focus-band'))", "dark map focus");
    const darkNodesDoNotOverlap = await evaluate(`(() => {
      const rectangles = [...document.querySelectorAll('.map-skill-node .skill-hit')].map((node) => node.getBoundingClientRect());
      return rectangles.every((left, index) => rectangles.slice(index + 1).every((right) => (
        left.right <= right.left || right.right <= left.left || left.bottom <= right.top || right.bottom <= left.top
      )));
    })()`);
    assert.equal(darkNodesDoNotOverlap, true, "dark focused map nodes must not overlap");
    const screenshot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.mkdirSync(path.dirname(requestedDarkScreenshot), { recursive: true });
    fs.writeFileSync(requestedDarkScreenshot, Buffer.from(screenshot.data, "base64"));
  }
  assert.deepEqual(browserIssues, [], `browser issues: ${browserIssues.join(" | ")}`);

  process.stdout.write(`${JSON.stringify({ status: "pass", desktop: true, mobile390: true, libraryFirst: true, mapFirst: true, explicitUrlOverride: true, configuredEdges: true, keepRefresh: true, keyboard: true, bilingual: true, darkContrast: { body: bodyContrast, list: listContrast }, screenshot: requestedDarkScreenshot ? path.basename(requestedDarkScreenshot) : null })}\n`);
} finally {
  socket?.close();
  chrome?.kill();
  if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
