import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview as startPreview } from "vite";
import { resolveVisualQaContext } from "./project-layout.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const qaContext = resolveVisualQaContext(projectDir);
const { outputDir, stableEvidenceDir, profileDir, sourceCommit: gitHead } = qaContext;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const personalDataStorageKey = "personal-agent-os.personal-data.v1";
const previewPort = Number(process.env.QA_PORT ?? 0);
const debugPort = process.env.QA_DEBUG_PORT ? Number(process.env.QA_DEBUG_PORT) : await getFreePort();

const requiredVisualStates = [
  "librarian-idle",
  "librarian-search",
  "catalog-overview",
  "catalog-category",
  "orbit-category",
  "orbit-library",
  "inspector",
  "outcome-composer",
  "history-one-outcome",
  "librarian-system-hover",
  "maintenance",
];

const mobileCjkExpectations = {
  "librarian-idle": {
    outcome: "required",
    selectors: [".librarian-search-foot > span"],
  },
  "librarian-search": {
    outcome: "required",
    selectors: [".ranked-description", ".ranked-meta > span"],
  },
  "librarian-system-hover": {
    outcome: "required",
    selectors: [".librarian-search-foot > span"],
  },
  "catalog-overview": {
    outcome: "required",
    selectors: [
      '[data-page="catalog"] .page-header h1',
      '[data-page="catalog"] .page-header p',
      '[data-page="catalog"] .catalog-category-card strong',
      '[data-page="catalog"] .catalog-category-card small',
      '[data-page="catalog"] .catalog-section-heading h2',
      '[data-page="catalog"] .catalog-section-heading p',
    ],
  },
  "catalog-category": {
    outcome: "required",
    selectors: [
      '[data-page="category"] .page-header h1',
      '[data-page="category"] .page-header p',
      '[data-page="category"] .section-heading h2',
      '[data-page="category"] .section-heading p',
      ".function-rail-item strong",
    ],
  },
  "orbit-category": {
    outcome: "required",
    selectors: ['.silent-orbit-page[data-view-mode="category"] .celestial-system[data-active="true"] strong'],
  },
  "orbit-library": {
    outcome: "required",
    selectors: ['.orbit-mobile-context-nav[data-orbit-mobile-mode="library"] .orbit-mobile-context-back'],
  },
  inspector: {
    outcome: "required",
    selectors: [".drawer-desc", ".inspector-source-details p", ".inspector-source-example"],
  },
  "outcome-composer": {
    outcome: "required",
    selectors: [".outcome-composer-body > p"],
  },
  "history-one-outcome": {
    outcome: "required",
    selectors: [".outcome-history-item h2", ".outcome-history-item .outcome-note"],
  },
  maintenance: {
    outcome: "required",
    selectors: [
      '[data-page="maintenance"] .page-header h1',
      '[data-page="maintenance"] .page-header p',
      ".maintenance-channel-card strong",
      ".maintenance-channel-card span",
      ".maintenance-handoff p",
    ],
  },
};

if (!fs.existsSync(chromePath)) {
  throw new Error(`Chrome not found at ${chromePath}`);
}

if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

if (fs.existsSync(profileDir)) {
  fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
fs.mkdirSync(profileDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  gitHead,
  targetUrl: null,
  outputDir: ".",
  viewports: [],
  screenshots: [],
  requiredStates: [...requiredVisualStates],
  stateCoverage: [],
  checks: [],
  consoleIssues: [],
  summary: {
    expectedScreenshots: 22,
    expectedStatesPerViewport: requiredVisualStates.length,
    expectedInspectors: 2,
    expectedOutcomeComposers: 2,
    screenshotCount: 0,
    inspectorCount: 0,
    outcomeComposerCount: 0,
    consoleRuntimeErrorCount: 0,
  },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Could not allocate a Chrome debug port."));
      });
    });
  });
}

let preview = null;
let chrome = null;
let socket = null;
let targetUrl = null;
let id = 0;
const pending = new Map();

async function cleanup() {
  socket?.close();
  chrome?.kill();
  await preview?.close();
  await wait(750);
  if (fs.existsSync(profileDir)) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    } catch (error) {
      console.warn(`warning: could not remove temporary visual QA profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function waitForHttp(url, tries = 50) {
  for (let index = 0; index < tries; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await wait(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getJson(url, tries = 30) {
  for (let index = 0; index < tries; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await wait(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

try {
  preview = process.env.QA_URL
    ? null
    : await startPreview({
        root: projectDir,
        logLevel: "warn",
        preview: {
          host: "127.0.0.1",
          port: previewPort,
          strictPort: previewPort !== 0,
        },
      });
  const previewAddress = preview?.httpServer.address();
  targetUrl =
    process.env.QA_URL ??
    (previewAddress && typeof previewAddress !== "string" ? `http://127.0.0.1:${previewAddress.port}/` : null);
  if (!targetUrl) throw new Error("Could not resolve the visual QA preview URL.");
  manifest.targetUrl = targetUrl;

  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1440,1100",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${debugPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  await waitForHttp(targetUrl);
  const targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
  const pageTarget = targets.find((target) => target.type === "page");
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error("Could not find a Chrome page target for visual QA.");
  }

  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      manifest.consoleIssues.push({
        type: "exception",
        text: message.params?.exceptionDetails?.text ?? "Runtime exception",
      });
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const call = message.params;
      if (call?.type === "error" || call?.type === "assert" || call?.type === "warning") {
        const callFrame = call.stackTrace?.callFrames?.[0];
        const text = call.args?.map((argument) => {
          const argumentType = argument.subtype ?? argument.type ?? "unknown";
          if (Object.hasOwn(argument, "value")) {
            const value = typeof argument.value === "string" ? argument.value : JSON.stringify(argument.value);
            return `${argumentType}:${value}`;
          }
          return `${argumentType}:${argument.unserializableValue ?? argument.description ?? "unavailable"}`;
        }).join(" ") || `console.${call.type}`;
        manifest.consoleIssues.push({
          type: call.type === "warning" ? "warning" : "error",
          consoleType: call.type,
          text,
          source: "Runtime.consoleAPICalled",
          location: callFrame
            ? `${callFrame.url || "<anonymous>"}:${callFrame.lineNumber + 1}:${callFrame.columnNumber + 1}`
            : null,
        });
      }
    }
    if (message.method === "Log.entryAdded") {
      const entry = message.params?.entry;
      if (entry?.level === "error" || entry?.level === "warning") {
        manifest.consoleIssues.push({
          type: entry.level,
          text: entry.text,
          source: entry.source,
        });
      }
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
} catch (error) {
  manifest.consoleIssues.push({ type: "setup", text: error instanceof Error ? error.message : String(error) });
  updateSummary();
  writeOutputs();
  await cleanup();
  throw error;
}

function cdp(method, params = {}) {
  id += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

async function setViewport(viewport) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: viewport.mobile,
  });
}

async function navigateHome() {
  await evaluate(`(() => {
    const state = { ...(history.state ?? {}) };
    delete state.agentOsSurface;
    history.replaceState({
      ...state,
      agentOsConsolePage: 'librarian',
      agentOsCategory: null,
      agentOsSkill: null,
    }, '');
    return true;
  })()`);
  await cdp("Page.navigate", { url: targetUrl });
  await wait(1300);
  await evaluate("history.replaceState(null, '', location.href); true");
}

async function resetToConsole(label) {
  await navigateHome();
  const removedPersonalData = await evaluate(`(() => {
    const hadPersonalData = localStorage.getItem(${JSON.stringify(personalDataStorageKey)}) !== null;
    localStorage.removeItem(${JSON.stringify(personalDataStorageKey)});
    return hadPersonalData;
  })()`);
  if (removedPersonalData) {
    await cdp("Page.navigate", { url: targetUrl });
    await wait(1000);
    await evaluate("history.replaceState(null, '', location.href); true");
  }
  await assertPage(
    `${label} starts from clean Console state`,
    `(() => {
      const input = document.querySelector('.librarian-search input');
      return Boolean(
        document.querySelector('.agent-console[data-surface="console"]') &&
        document.querySelector('.librarian-page.is-idle') &&
        !document.querySelector('.silent-orbit-page') &&
        input?.value === '' &&
        history.state?.agentOsSurface !== 'orbit'
      );
    })()`,
  );
}

async function assertPage(label, expression) {
  const ok = await evaluate(expression);
  manifest.checks.push({ label, ok: Boolean(ok) });
  if (!ok) console.log(`failed check: ${label}`);
}

async function assertPageResult(label, expression) {
  const result = await evaluate(expression);
  const ok = Boolean(result?.ok);
  manifest.checks.push({ label, ok, details: result });
  if (!ok) console.log(`failed check: ${label}; ${JSON.stringify(result)}`);
}

async function clickBySelector(selector) {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element?.click();
    return Boolean(element);
  })()`);
  if (!clicked) throw new Error(`Could not click ${selector}`);
}

async function enterOrbitCategory() {
  await clickBySelector('.portal-system-hit[data-system-id="zone:个人知识库与本地工具"]');
  await wait(850);
  const openedDirectly = await evaluate(
    "document.querySelector('.silent-orbit-page[data-view-mode=\"category\"]') && [...document.querySelectorAll('.library-moon')].some((item) => item.textContent.includes('obsidian'))",
  );
  if (!openedDirectly) throw new Error("Could not open the obsidian Category directly from its homepage System star.");
}

async function enterOrbitLibrary() {
  await enterOrbitCategory();
  const clicked = await evaluate(`(() => {
    const node = [...document.querySelectorAll('.library-moon')].find((item) => item.textContent.includes('obsidian'))
      ?? document.querySelector('.library-moon');
    node?.click();
    return Boolean(node);
  })()`);
  if (!clicked) throw new Error("Could not enter Orbit library focus.");
  await wait(450);
  if (await evaluate("innerWidth > 700")) {
    await assertPage(
      "deep Orbit Library depth subdues context behind the selected Library and Skills",
      `(() => {
        const opacity = (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity);
        const skillAsset = document.querySelector('.skill-asteroid .skill-cosmos-asset');
        return opacity('.orbit-star-field') <= .23
          && opacity('.orbit-library-ring') <= .11
          && opacity('.orbit-skill-ring') <= .25
          && opacity('.celestial-system[data-active="true"]') <= .11
          && opacity('.celestial-system:not([data-active="true"])') <= .03
          && opacity('.library-moon[aria-pressed="true"]') === 1
          && opacity('.library-moon:not([aria-pressed="true"])') <= .06
          && opacity('.orbit-relic-landmark') <= .05
          && Number(getComputedStyle(skillAsset).opacity) >= .78;
      })()`,
    );
  }
  if (await evaluate("innerWidth > 620")) {
    const point = await evaluate(`(() => {
      const target = document.querySelector('.skill-asteroid');
      const box = target?.getBoundingClientRect();
      return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    })()`);
    if (!point) throw new Error("Could not locate a deep Orbit Skill hover target.");
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await wait(240);
    await assertPageResult(
      "deep Orbit Skill hover enlarges and brightens without rotating",
      `(() => {
        const target = document.querySelector('.skill-asteroid:hover');
        const image = target?.querySelector('.skill-cosmos-asset');
        const label = target?.querySelector('.asteroid-label');
        if (!target || !image || !label) return { ok: false, reason: 'missing hovered Skill elements' };
        const targetBox = target.getBoundingClientRect();
        const imageBox = image.getBoundingClientRect();
        const imageStyle = getComputedStyle(image);
        const matrix = new DOMMatrix(imageStyle.transform);
        const labelOpacity = Number(getComputedStyle(label).opacity);
        return {
          ok: targetBox.width >= 60
          && targetBox.height >= 60
          && imageBox.width >= 38
          && imageBox.height >= 38
          && Number(imageStyle.opacity) === 1
          && matrix.a >= 1.15
          && Math.abs(matrix.b) < .001
          && Math.abs(matrix.c) < .001
          && labelOpacity === 1,
          targetBox: { width: targetBox.width, height: targetBox.height },
          imageBox: { width: imageBox.width, height: imageBox.height },
          opacity: Number(imageStyle.opacity),
          matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d },
          labelOpacity,
        };
      })()`,
    );
  }
}

async function enterLibrarianSearch() {
  await evaluate("document.querySelector('.librarian-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "过去一周内值得关注的 AI 消息" });
  await wait(250);
  await assertPage(
    "Librarian draft remains idle before submit",
    "document.querySelector('.librarian-page.is-idle') && document.querySelectorAll('.ranked-skill-card').length === 0",
  );
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(500);
}

async function enterLibrarianSystemHover() {
  const point = await evaluate(`(() => {
    const box = document.querySelector('.portal-system-hit[data-system-id]')?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  })()`);
  if (!point) throw new Error("Could not locate a homepage System hover target.");
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await wait(240);
  await assertPage(
    "hovered homepage System uses the asset-only light and scale response",
    `(() => {
      const button = document.querySelector('.portal-system-hit:hover');
      const active = document.querySelector('.portal-system-star[data-active="true"]');
      const marker = active?.querySelector('.portal-system-visual');
      const buttonStyle = button && getComputedStyle(button);
      const markerStyle = marker && getComputedStyle(marker);
      const markerScale = markerStyle?.transform && markerStyle.transform !== 'none'
        ? new DOMMatrixReadOnly(markerStyle.transform).a
        : 1;
      return button?.matches('.portal-system-hit[data-system-id]')
        && Number(markerStyle?.opacity ?? 0) >= .99
        && markerScale >= 1.4
        && buttonStyle?.outlineStyle === 'none'
        && buttonStyle?.boxShadow === 'none'
        && buttonStyle?.backgroundColor === 'rgba(0, 0, 0, 0)';
    })()`,
  );
  await wait(100);
}

async function enterCatalogOverview() {
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(300);
  await assertPage(
    "Catalog visual state opens at functional categories",
    "Boolean(document.querySelector('[data-page=\"catalog\"]') && document.querySelectorAll('.catalog-category-card').length > 0 && !document.querySelector('[data-page=\"catalog\"] .unit-card'))",
  );
}

async function enterCatalogCategory() {
  await enterCatalogOverview();
  await clickBySelector(".catalog-category-card");
  await wait(300);
  await assertPage(
    "Catalog visual state focuses one functional category",
    "Boolean(document.querySelector('[data-page=\"category\"]') && document.querySelector('.function-rail') && document.querySelector('.unit-card'))",
  );
}

async function enterMaintenance() {
  await enterCatalogOverview();
  await clickBySelector('.catalog-secondary-action[data-catalog-target="maintenance"]');
  await wait(300);
  await assertPage(
    "Maintenance visual state exposes only its sanitized handoff surface",
    "Boolean(document.querySelector('[data-page=\"maintenance\"]') && document.querySelectorAll('.maintenance-channel-card').length === 3 && document.querySelector('[data-maintenance-action=\"copy-handoff\"]') && !/hatch-pet|humanizer/i.test(document.querySelector('[data-page=\"maintenance\"]')?.textContent ?? ''))",
  );
}

async function enterVerifiedInspector() {
  await evaluate("document.querySelector('.librarian-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "skill-installer" });
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(400);
  const opened = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.ranked-skill-card')]
      .find((card) => card.textContent.toLowerCase().includes('skill-installer'));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!opened) throw new Error("Could not open the verified skill-installer Inspector.");
  await wait(300);
  await assertPage(
    "verified Inspector uses the explicit skill-installer detail record",
    `(() => {
      const dialog = document.querySelector('[data-surface="skill-inspector"][role="dialog"][aria-modal="true"]');
      const details = dialog?.querySelector('.inspector-source-details');
      return Boolean(dialog?.textContent.toLowerCase().includes('skill-installer')
        && details
        && /[\u3400-\u9fff]/u.test(details.textContent)
        && details.querySelector('a.source-link[href]')
        && details.querySelector('.inspector-source-example a[href]'));
    })()`,
  );
}

async function enterOutcomeComposer() {
  await enterVerifiedInspector();
  await clickBySelector(".outcome-record-button");
  await wait(200);
  await assertPage(
    "Outcome Composer opens from the verified Inspector record flow",
    "Boolean(document.querySelector('[data-surface=\"outcome-composer\"][role=\"dialog\"][aria-modal=\"true\"]') && document.querySelector('[data-surface=\"skill-inspector\"]')?.inert)",
  );
}

async function enterHistoryWithOneOutcome() {
  await enterOutcomeComposer();
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"title\"]')?.focus(); true");
  await cdp("Input.insertText", { text: "本地视觉验收结果" });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] textarea[name=\"note\"]')?.focus(); true");
  await cdp("Input.insertText", { text: "仅保存在本机的发布验收证据。" });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"artifactRef\"]')?.focus(); true");
  await cdp("Input.insertText", { text: "local://agent-os/task-9-visual-qa" });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] form')?.requestSubmit(); true");
  await wait(300);
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'HISTORY')?.click(); true");
  await wait(300);
  await assertPage(
    "History visual fixture is one legal local outcome created through the record flow",
    `(() => {
      const raw = localStorage.getItem(${JSON.stringify(personalDataStorageKey)});
      const data = raw && JSON.parse(raw);
      const items = [...document.querySelectorAll('.outcome-history-item')];
      return data?.schemaVersion === 1
        && data.outcomes?.length === 1
        && data.outcomes[0]?.skillId === 'skill-installer'
        && data.outcomes[0]?.title === '本地视觉验收结果'
        && data.outcomes[0]?.note === '仅保存在本机的发布验收证据。'
        && data.outcomes[0]?.artifactRef === 'local://agent-os/task-9-visual-qa'
        && items.length === 1
        && items[0].getAttribute('data-outcome-id') === data.outcomes[0].id;
    })()`,
  );
}

async function assertConsole(viewport, state) {
  await assertPage(
    `${viewport.name} ${state.name} Librarian controls visible`,
    "Boolean(document.querySelector('.librarian-search') && document.querySelector('.librarian-galaxy-portal')) && !document.querySelector('.function-rail,.command-deck,.task-matrix')",
  );
  await assertPage(
    `${viewport.name} ${state.name} Console semantic surface`,
    "Boolean(document.querySelector('.agent-console[data-surface=\"console\"]')) && !document.querySelector('.silent-orbit-page')",
  );
  await assertPage(
    `${viewport.name} ${state.name} portal preview noninteractive`,
    "!document.querySelector('.silent-orbit-preview button,.silent-orbit-preview [tabindex]')",
  );
  await assertPage(
    `${viewport.name} ${state.name} portal exposes nine direct System entries without Overview`,
    "!document.querySelector('.portal-entry-trigger') && document.querySelectorAll('.portal-system-hit[data-system-id]').length === 9",
  );
  if (state.name === "librarian-idle") {
    await assertPage(
      `${viewport.name} idle direct System entries stay large, visible, and locally hittable`,
      `(() => {
        const buttons = [...document.querySelectorAll('.portal-system-hit[data-system-id]')];
        return buttons.length === 9 && buttons.every((button) => {
          const box = button.getBoundingClientRect();
          const centerX = box.left + box.width / 2;
          const centerY = box.top + box.height / 2;
          const hit = document.elementFromPoint(centerX, centerY);
          return box.width >= 96 && box.height >= 96
            && centerX >= 0 && centerX <= innerWidth
            && centerY >= 0 && centerY <= innerHeight
            && (hit === button || button.contains(hit));
        });
      })()`,
    );
  }
  await assertPage(
    `${viewport.name} ${state.name} Librarian uses exact black and white surfaces`,
    `(() => {
      const parse = (value) => value.match(/\\d+/g)?.slice(0, 3).map(Number).join(',') ?? null;
      const effectiveBackground = (element) => {
        for (let current = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          const alpha = Number(style.backgroundColor.match(/[\\d.]+/g)?.[3] ?? 1);
          if (alpha > 0) return parse(style.backgroundColor);
        }
        return null;
      };
      const panels = [...document.querySelectorAll('.librarian-search,.librarian-galaxy-portal,.ranked-skill-card')];
      const shell = document.querySelector('.agent-console.is-librarian-home');
      const stars = [...document.querySelectorAll('.portal-system-star')];
      return Boolean(shell)
        && effectiveBackground(shell) === '0,0,0'
        && parse(getComputedStyle(shell).color) === '255,255,255'
        && panels.every((panel) => effectiveBackground(panel) === '0,0,0' && parse(getComputedStyle(panel).color) === '255,255,255')
        && stars.length > 0
        && stars.every((star) => parse(getComputedStyle(star).color) === '255,255,255');
    })()`,
  );
  if (state.name === "librarian-idle") {
    await assertPage(`${viewport.name} idle has no result cards`, "document.querySelectorAll('.ranked-skill-card').length === 0 && Boolean(document.querySelector('.librarian-page.is-idle'))");
    await assertPage(`${viewport.name} idle Observatory preserves the selected raster galaxy and catalog identities`, `(() => {
      const svg = document.querySelector('.librarian-page.is-idle .silent-orbit-preview');
      const catalogNodes = [...(svg?.querySelectorAll('[data-catalog-node-id]') ?? [])];
      const skillTraces = [...(svg?.querySelectorAll('[data-skill-trace]') ?? [])];
      const asset = svg?.querySelector('image.portal-galaxy-asset');
      const markers = [...(svg?.querySelectorAll('image.portal-system-visual[data-system-marker-asset="distant-ecliptic"]') ?? [])];
      const allowedMarkerAssets = new Set(['/assets/system-ecliptic-a.png', '/assets/system-ecliptic-b.png', '/assets/system-ecliptic-c.png']);
      const skillCount = Number(svg?.getAttribute('data-catalog-skill-count') ?? 0);
      const expected = Number(svg?.getAttribute('data-catalog-skill-count') ?? 0)
        + Number(svg?.getAttribute('data-catalog-system-count') ?? 0);
      return svg?.getAttribute('preserveAspectRatio') === 'xMidYMax slice'
        && svg.getAttribute('data-galaxy-renderer') === 'raster-asset'
        && expected >= 150
        && catalogNodes.length === expected
        && new Set(catalogNodes.map((node) => node.getAttribute('data-catalog-node-id'))).size === expected
        && skillTraces.length === skillCount
        && asset?.getAttribute('href') === '/assets/galaxy-horizon-drift-v3.png'
        && asset.getAttribute('preserveAspectRatio') === 'xMidYMax slice'
        && asset.getAttribute('width') === '160'
        && asset.getAttribute('height') === '76'
        && markers.length === 9
        && markers.every((marker) => allowedMarkerAssets.has(marker.getAttribute('href')))
        && !svg.querySelector('.portal-system-orbit,.portal-system-core,.portal-system-star > path')
        && svg.querySelectorAll('.portal-spiral-arm,.portal-nucleus-ring,.portal-skill-star').length === 0
        && svg.querySelectorAll('linearGradient,radialGradient,filter').length === 0;
    })()`);
  }
  if (state.name === "librarian-search") {
    await assertPage(`${viewport.name} submitted has three ranked cards`, "document.querySelectorAll('button.ranked-skill-card').length === 3 && Boolean(document.querySelector('.librarian-page.is-searching'))");
    await assertPage(`${viewport.name} submitted includes aihot`, "[...document.querySelectorAll('.ranked-skill-card')].some((card) => card.textContent.toLowerCase().includes('aihot'))");
    await assertPage(`${viewport.name} submitted portal uses CSS horizon compression`, "document.querySelector('.librarian-page.is-searching .silent-orbit-preview')?.getAttribute('preserveAspectRatio') === 'xMidYMax slice' && getComputedStyle(document.querySelector('.librarian-page.is-searching .portal-map')).transform !== 'none'");
    await assertPage(`${viewport.name} submitted cards have unique deterministic constellations`, `(() => {
      const cards = [...document.querySelectorAll('button.ranked-skill-card')];
      const visuals = cards.map((card) => card.querySelector('.ranked-skill-constellation'));
      const signatures = visuals.map((visual) => visual?.getAttribute('data-skill-signature'));
      const geometries = visuals.map((visual) => [
        visual?.querySelector('path')?.getAttribute('d'),
        ...[...(visual?.querySelectorAll('circle') ?? [])].map((point) => point.getAttribute('cx') + ',' + point.getAttribute('cy')),
      ].join('|'));
      return visuals.length === 3
        && visuals.every((visual) => visual?.getAttribute('aria-hidden') === 'true'
          && getComputedStyle(visual).pointerEvents === 'none'
          && visual.querySelectorAll('path').length === 1
          && visual.querySelectorAll('circle').length >= 5)
        && new Set(signatures).size === 3
        && new Set(geometries).size === 3
        && cards.every((card) => card.querySelectorAll('button,a,[role=\"button\"],[tabindex]').length === 0);
    })()`);
  }
}

async function assertOrbit(viewport, state) {
  await assertPage(
    `${viewport.name} ${state.name} Orbit semantic surface`,
    "Boolean(document.querySelector('.silent-orbit-page[data-surface=\"orbit\"]')) && !document.querySelector('.agent-console')",
  );
  await assertPage(
    `${viewport.name} ${state.name} correct mode`,
    `document.querySelector('.silent-orbit-page')?.getAttribute('data-view-mode') === ${JSON.stringify(state.mode)}`,
  );
  await assertPage(
    `${viewport.name} ${state.name} controls inside viewport`,
    "(() => [...document.querySelectorAll('.orbit-controls button')].map((node) => node.getBoundingClientRect()).every((box) => box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight))()",
  );
  if (viewport.mobile) {
    await assertPageResult(
      `${viewport.name} ${state.name} visible Orbit target centers hit their own controls`,
      `(() => {
        const targets = [...document.querySelectorAll('.orbit-world button')]
        .filter((node) => {
          const style = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity) > 0
            && box.width > 0
            && box.height > 0
            && box.right > 0
            && box.left < innerWidth
            && box.bottom > 0
            && box.top < innerHeight;
        });
        const results = targets.map((node) => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {
            identity: node.getAttribute('data-skill-id')
              ?? node.getAttribute('data-station-id')
              ?? node.getAttribute('data-system-id'),
            className: String(node.className),
            center: {
              x: Math.round((box.left + box.width / 2) * 10) / 10,
              y: Math.round((box.top + box.height / 2) * 10) / 10,
            },
            hitSelf: hit === node || node.contains(hit),
            hitIdentity: hit?.closest('button')?.getAttribute('data-skill-id')
              ?? hit?.closest('button')?.getAttribute('data-station-id')
              ?? hit?.closest('button')?.getAttribute('data-system-id')
              ?? null,
            hitClassName: hit?.closest('button')?.className ? String(hit.closest('button').className) : null,
          };
        });
        return {
          ok: targets.length > 0 && results.every((result) => result.hitSelf),
          renderedInViewportCount: targets.length,
          failures: results.filter((result) => !result.hitSelf),
          results,
        };
      })()`,
    );
    await assertPageResult(
      `${viewport.name} ${state.name} exposes a non-empty native identity rail`,
      `(() => {
        const mode = ${JSON.stringify(state.mode)};
        const nav = document.querySelector('.orbit-mobile-context-nav[data-orbit-mobile-mode="' + mode + '"]');
        const visible = (node) => {
          const style = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity) > 0
            && box.width >= 44
            && box.height >= 44
            && box.right > 0
            && box.left < innerWidth;
        };
        const allButtons = [...(nav?.querySelectorAll('button') ?? [])];
        const visibleButtons = allButtons.filter(visible);
        let identities = [];
        let exactSearchSkill = null;
        let ok = Boolean(nav) && allButtons.length > 0 && visibleButtons.length > 0;
        if (mode === 'overview') {
          identities = [...(nav?.querySelectorAll('button[data-system-id]') ?? [])];
          ok = ok
            && identities.length === document.querySelectorAll('.celestial-system').length
            && identities.length > 0
            && identities.every((button) => button.getAttribute('data-system-id')?.startsWith('zone:')
              && button.textContent.trim().length > 0
              && Number(button.querySelector('small')?.textContent) > 0);
        } else if (mode === 'category') {
          identities = [...(nav?.querySelectorAll('button[data-station-id]') ?? [])];
          ok = ok
            && identities.length === document.querySelectorAll('.library-moon').length
            && identities.length > 0
            && identities.every((button) => button.getAttribute('data-station-id')?.startsWith('station:')
              && button.textContent.trim().length > 0);
        } else if (mode === 'library') {
          identities = [...(nav?.querySelectorAll('button[data-station-id]') ?? [])];
          ok = ok && identities.length > 0 && Boolean(nav?.querySelector('button[data-system-id]'));
        } else if (mode === 'search') {
          identities = [...(nav?.querySelectorAll('button[data-skill-id]') ?? [])];
          exactSearchSkill = nav?.querySelector('button[data-skill-id="skill:obsidian-vault"][data-station-id="station:library:local:obsidian"]') ?? null;
          ok = ok
            && identities.length === document.querySelectorAll('.skill-asteroid').length
            && identities.length > 0
            && identities.every((button) => button.getAttribute('data-skill-id')?.startsWith('skill:')
              && button.getAttribute('data-station-id')?.startsWith('station:')
              && button.textContent.trim().length > 0)
            && exactSearchSkill?.textContent.trim() === 'obsidian-vault'
            && visible(exactSearchSkill);
        }
        return {
          ok,
          mode,
          buttonCount: allButtons.length,
          visibleButtonCount: visibleButtons.length,
          identityCount: identities.length,
          exactSearchSkill: exactSearchSkill?.textContent.trim() ?? null,
        };
      })()`,
    );
    await assertPageResult(
      `${viewport.name} ${state.name} reduces decorative starfield before identity text`,
      `(() => {
        const stars = [...document.querySelectorAll('.orbit-star-field circle')];
        const visible = stars.filter((star) => {
          const style = getComputedStyle(star);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
        });
        return { ok: stars.length > 0 && visible.length > 0 && visible.length <= 8, total: stars.length, visible: visible.length };
      })()`,
    );
    await assertPage(
      `${viewport.name} ${state.name} enlarged star targets keep sparse visual markers`,
      `(() => [...document.querySelectorAll('.library-moon:not([aria-pressed="true"]),.skill-asteroid')].every((node) => {
        const style = getComputedStyle(node);
        const marker = getComputedStyle(node, '::before');
        const borderHidden = style.borderStyle === 'none' || style.borderColor === 'rgba(0, 0, 0, 0)';
        return borderHidden
          && marker.content !== 'none'
          && Number.parseFloat(marker.width) <= 3
          && Number.parseFloat(marker.height) <= 3;
      }))()`,
    );
    if (state.mode === "library") {
      await assertPage(
        `${viewport.name} ${state.name} context navigation exposes category and every sibling library`,
        `(() => {
          const nav = document.querySelector('.orbit-mobile-context-nav');
          const back = nav?.querySelector('button[data-system-id]');
          const libraries = [...(nav?.querySelectorAll('button[data-station-id]') ?? [])];
          const worldLibraries = [...document.querySelectorAll('.library-moon')];
          const buttons = back ? [back, ...libraries] : [];
          const selectedWorld = document.querySelector('.library-moon[aria-pressed="true"]')?.getAttribute('data-station-id');
          return Boolean(nav && back)
            && back.getAttribute('data-system-id')?.startsWith('zone:')
            && libraries.length > 1
            && libraries.length === worldLibraries.length
            && new Set(libraries.map((node) => node.getAttribute('data-station-id'))).size === libraries.length
            && libraries.every((node) => node.getAttribute('data-station-id')?.startsWith('station:') && node.textContent.trim().length > 0)
            && libraries.filter((node) => node.getAttribute('aria-current') === 'page').length === 1
            && libraries.find((node) => node.getAttribute('aria-current') === 'page')?.getAttribute('data-station-id') === selectedWorld
            && buttons.every((node) => {
              const box = node.getBoundingClientRect();
              return box.width >= 44 && box.height >= 44;
            });
        })()`,
      );
    }
  }
  if (!viewport.mobile) {
    if (state.mode === "category" || state.mode === "library") {
      const selector = state.mode === "category" ? ".library-moon" : ".skill-asteroid";
      await assertPageResult(
        `${viewport.name} ${state.name} interactive Orbit targets preserve real empty space`,
        `(() => {
          const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
          const collisions = [];
          for (let index = 0; index < nodes.length; index += 1) {
            const left = nodes[index].getBoundingClientRect();
            for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
              const right = nodes[otherIndex].getBoundingClientRect();
              const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
              const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
              if (width * height > 0) collisions.push([
                nodes[index].getAttribute('aria-label'),
                nodes[otherIndex].getAttribute('aria-label'),
              ]);
            }
          }
          return { ok: nodes.length > 0 && collisions.length === 0, nodeCount: nodes.length, collisions };
        })()`,
      );
    }
    if (state.mode === "library") {
      await assertPage(
        `${viewport.name} ${state.name} parent system identity yields to the selected library`,
        `Number(getComputedStyle(document.querySelector('.celestial-system[data-active="true"] .system-copy')).opacity) === 0`,
      );
      await assertPageResult(
        `${viewport.name} ${state.name} selected library identity corridor avoids skill controls and hover labels`,
        `(() => {
          const copy = document.querySelector('.library-moon[aria-pressed="true"] .moon-copy')?.getBoundingClientRect();
          const candidates = [...document.querySelectorAll('.skill-asteroid,.skill-asteroid .asteroid-label')];
          if (!copy || candidates.length === 0) return { ok: false, candidateCount: candidates.length };
          const collisions = candidates.filter((node) => {
            const box = node.getBoundingClientRect();
            const horizontal = Math.max(0, Math.min(copy.right, box.right) - Math.max(copy.left, box.left));
            const vertical = Math.max(0, Math.min(copy.bottom, box.bottom) - Math.max(copy.top, box.top));
            return horizontal * vertical > 0;
          });
          return { ok: collisions.length === 0, candidateCount: candidates.length, collisions: collisions.map((node) => node.textContent.trim()) };
        })()`,
      );
    }
    await assertPageResult(
      `${viewport.name} ${state.name} visible system labels avoid severe overlap`,
      `(() => {
        const boxes = [...document.querySelectorAll('.celestial-system strong')]
          .filter((label) => Number(getComputedStyle(label).opacity) > 0)
          .map((label) => label.getBoundingClientRect());
        const ok = boxes.length > 0 && boxes.every((box, index) => boxes.slice(index + 1).every((other) => {
          const width = Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left));
          const height = Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top));
          const smaller = Math.min(box.width * box.height, other.width * other.height);
          return smaller === 0 || (width * height) / smaller <= 0.08;
        }));
        return { ok, visibleLabelCount: boxes.length };
      })()`,
    );
  }

  const densityExpressions = {
    overview: "document.querySelectorAll('.library-moon,.skill-asteroid').length === 0",
    category: "document.querySelectorAll('.library-moon').length > 0 && document.querySelectorAll('.skill-asteroid').length === 0",
    library: "document.querySelectorAll('.library-moon').length > 0 && document.querySelectorAll('.skill-asteroid').length > 0 && document.querySelectorAll('.skill-asteroid').length < 80",
    search: "document.querySelectorAll('.library-moon').length > 0 && document.querySelectorAll('.skill-asteroid').length > 0 && document.querySelectorAll('.skill-asteroid').length < 80 && [...document.querySelectorAll('.skill-asteroid')].every((node) => node.textContent.toLowerCase().includes('obsidian'))",
  };
  await assertPage(`${viewport.name} ${state.name} depth density`, densityExpressions[state.mode]);
}

async function assertHorizontalRailReachability(viewport, state) {
  if (!viewport.mobile) return;
  const rail = state.name === "catalog-category"
    ? { name: "FunctionRail", container: ".function-rail", items: ".function-rail-item", identity: "category" }
    : state.surface === "orbit"
      ? { name: "Orbit identity rail", container: ".orbit-mobile-context-nav", items: "button", identity: "orbit" }
      : null;
  if (!rail) return;

  await assertPageResult(
    `${viewport.name} ${state.name} ${rail.name} reaches every stable identity by horizontal scroll and center hit`,
    `(async () => {
      const container = document.querySelector(${JSON.stringify(rail.container)});
      const rendered = (node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return !node.closest('[inert],[aria-hidden="true"]')
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0
          && box.width > 0
          && box.height > 0;
      };
      const stableId = (node) => {
        if (${JSON.stringify(rail.identity)} === 'category') {
          const value = node.getAttribute('data-category-id');
          return value?.startsWith('category:') ? value : null;
        }
        for (const [attribute, prefix] of [
          ['data-skill-id', 'skill-id='],
          ['data-station-id', 'station-id='],
          ['data-system-id', 'system-id='],
        ]) {
          const value = node.getAttribute(attribute);
          if (value) return prefix + value;
        }
        return null;
      };
      const items = [...(container?.querySelectorAll(${JSON.stringify(rail.items)}) ?? [])].filter(rendered);
      const originalScrollLeft = container?.scrollLeft ?? 0;
      const results = [];
      if (container) {
        for (const item of items) {
          const containerBox = container.getBoundingClientRect();
          const before = item.getBoundingClientRect();
          const desired = container.scrollLeft
            + before.left + before.width / 2
            - (containerBox.left + containerBox.width / 2);
          const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
          container.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const box = item.getBoundingClientRect();
          const x = box.left + box.width / 2;
          const y = box.top + box.height / 2;
          const hit = document.elementFromPoint(x, y);
          results.push({
            stableId: stableId(item),
            scrollLeft: Math.round(container.scrollLeft * 10) / 10,
            center: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
            inViewport: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight,
            hitSelf: hit === item || item.contains(hit),
          });
        }
        const firstBox = items[0]?.getBoundingClientRect();
        const containerBox = container.getBoundingClientRect();
        const logicalStart = firstBox
          ? Math.max(0, container.scrollLeft + firstBox.left - containerBox.left)
          : 0;
        container.scrollLeft = logicalStart;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      const ids = results.map((result) => result.stableId).filter(Boolean);
      const firstBox = items[0]?.getBoundingClientRect();
      const containerBox = container?.getBoundingClientRect();
      const logicalStart = container && firstBox && containerBox
        ? Math.max(0, container.scrollLeft + firstBox.left - containerBox.left)
        : 0;
      const restoredScrollLeft = container?.scrollLeft ?? null;
      return {
        ok: Boolean(container)
          && items.length > 0
          && ids.length === items.length
          && new Set(ids).size === items.length
          && results.every((result) => result.inViewport && result.hitSelf)
          && Math.abs(restoredScrollLeft - logicalStart) <= 1,
        container: ${JSON.stringify(rail.container)},
        itemSelector: ${JSON.stringify(rail.items)},
        originalScrollLeft,
        logicalStart,
        restoredScrollLeft,
        renderedCount: items.length,
        measuredCount: results.length,
        stableIdCount: ids.length,
        uniqueStableIdCount: new Set(ids).size,
        overflowing: Boolean(container && container.scrollWidth > container.clientWidth),
        results,
      };
    })()`,
  );
}

async function readPageState() {
  return evaluate(`(() => {
    const page = document.querySelector('.silent-orbit-page');
    const controls = [...document.querySelectorAll('.orbit-controls button')].map((node) => node.getBoundingClientRect());
    return {
      surface: page?.getAttribute('data-surface') ?? document.querySelector('.agent-console')?.getAttribute('data-surface') ?? null,
      viewMode: page?.getAttribute('data-view-mode') ?? null,
      query: document.querySelector('.librarian-search input')?.value ?? null,
      systems: document.querySelectorAll('.celestial-system').length,
      libraries: document.querySelectorAll('.library-moon').length,
      skillAsteroids: document.querySelectorAll('.skill-asteroid').length,
      panelVisible: Boolean(document.querySelector('[role="dialog"]')),
      historySurface: history.state?.agentOsSurface ?? null,
      controlsInsideViewport: controls.length === 0 || controls.every((box) => box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight),
    };
  })()`);
}

async function captureScreenshot(viewport, state, pageState) {
  const filename = `${viewport.name}-${state.order}-${state.name}.png`;
  const filePath = path.join(outputDir, filename);
  const screenshot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
  const evidence = readPngEvidence(filePath);
  if (!evidence) throw new Error(`Could not read PNG evidence metadata for ${filename}.`);
  manifest.screenshots.push({
    viewport: viewport.name,
    state: state.name,
    file: filename,
    ...evidence,
    pageState,
  });
  console.log(`captured ${filename}`);
}

function readPngEvidence(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== pngSignature) return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function assertPortableScreenshotManifest() {
  const currentHead = gitHead;
  const records = manifest.screenshots.map((shot) => {
    const viewport = viewports.find((candidate) => candidate.name === shot.viewport);
    const resolved = path.resolve(outputDir, shot.file);
    const actual = readPngEvidence(resolved);
    return {
      viewport: shot.viewport,
      state: shot.state,
      file: shot.file,
      basenameOnly: shot.file === path.basename(shot.file),
      exists: Boolean(actual),
      dimensionsMatch: Boolean(actual
        && viewport
        && actual.width === viewport.width
        && actual.height === viewport.height
        && shot.width === actual.width
        && shot.height === actual.height),
      bytesMatch: Boolean(actual && shot.bytes === actual.bytes),
      sha256Match: Boolean(actual && shot.sha256 === actual.sha256),
      actual,
    };
  });
  const ok = manifest.outputDir === "."
    && manifest.gitHead === currentHead
    && records.length === manifest.summary.expectedScreenshots
    && new Set(records.map((record) => record.file)).size === manifest.summary.expectedScreenshots
    && records.every((record) => record.basenameOnly
      && record.exists
      && record.dimensionsMatch
      && record.bytesMatch
      && record.sha256Match);
  manifest.checks.push({
    label: "portable manifest resolves and verifies every PNG against the release source commit",
    ok,
    details: {
      expectedGitHead: currentHead,
      recordedGitHead: manifest.gitHead ?? null,
      outputDir: manifest.outputDir,
      screenshotCount: records.length,
      verifiedCount: records.filter((record) => record.basenameOnly
        && record.exists
        && record.dimensionsMatch
        && record.bytesMatch
        && record.sha256Match).length,
      failures: records.filter((record) => !(record.basenameOnly
        && record.exists
        && record.dimensionsMatch
        && record.bytesMatch
        && record.sha256Match)),
    },
  });
  if (!ok) console.log("failed check: portable manifest resolves and verifies every PNG against the release source commit");
}

async function assertMobileViewport(viewport, state) {
  if (!viewport.mobile) return;

  await assertPage(
    `${viewport.name} ${state.name} document has no horizontal overflow`,
    "document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1",
  );
  await assertPageResult(
    `${viewport.name} ${state.name} all rendered non-inert interactive targets are at least 44px`,
    `(() => {
      const renderedTargets = [...document.querySelectorAll('button,a[href],input,textarea,select,[role="button"],[tabindex]:not([tabindex="-1"])')]
        .filter((node) => {
          const style = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          return !node.closest('[inert],[aria-hidden="true"]')
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity) > 0
            && box.width > 0
            && box.height > 0;
        });
      const measuredTargets = renderedTargets.filter((target) => {
        const box = target.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      const inViewportTargets = measuredTargets.filter((target) => {
        const box = target.getBoundingClientRect();
        return box.right > 0
          && box.left < innerWidth
          && box.bottom > 0
          && box.top < innerHeight;
      });
      const failures = renderedTargets.filter((target) => {
        const box = target.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      }).map((target) => {
        const box = target.getBoundingClientRect();
        return {
          tag: target.tagName,
          className: String(target.className),
          text: target.textContent.trim().slice(0, 80),
          identity: target.getAttribute('data-category-id')
            ?? target.getAttribute('data-system-id')
            ?? target.getAttribute('data-station-id')
            ?? target.getAttribute('data-skill-id')
            ?? target.getAttribute('aria-label'),
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
        };
      });
      return {
        ok: renderedTargets.length > 0
          && measuredTargets.length === renderedTargets.length
          && failures.length === 0,
        renderedCount: renderedTargets.length,
        measuredCount: measuredTargets.length,
        inViewportCount: inViewportTargets.length,
        failures,
      };
    })()`,
  );

  const cjkExpectation = mobileCjkExpectations[state.name];
  await assertPageResult(
    `${viewport.name} ${state.name} CJK applicability and rendered wrapping are explicit`,
    `(() => {
      const config = ${JSON.stringify(cjkExpectation)};
      const hasHan = (node) => /[\u3400-\u9fff]/u.test(node.textContent ?? '');
      const rendered = (node) => {
        if (node.closest('[inert],[aria-hidden="true"],.sr-only')) return false;
        const box = node.getBoundingClientRect();
        for (let current = node; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
        }
        return box.width > 0 && box.height > 0;
      };
      const trackingIsNormal = (node) => {
        const style = getComputedStyle(node);
        const tracking = style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing);
        return Math.abs(tracking || 0) < 0.01;
      };
      const wrapsNormally = (node) => {
        const style = getComputedStyle(node);
        const compactRailLabel = Boolean(node.closest('.orbit-mobile-context-nav,.function-rail'));
        return (style.whiteSpace === 'normal' || (compactRailLabel && style.whiteSpace === 'nowrap'))
          && style.textOverflow !== 'ellipsis'
          && style.overflowWrap !== 'anywhere'
          && style.wordBreak !== 'break-all'
          && style.transform === 'none'
          && trackingIsNormal(node);
      };
      const selected = config.outcome === 'required'
        ? config.selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((node) => ({ selector, node })))
        : [...document.querySelectorAll('body *')]
            .filter((node) => node.children.length === 0)
            .map((node) => ({ selector: 'body * leaf Han scan', node }));
      const seen = new Set();
      const candidates = selected.filter(({ node }) => {
        if (seen.has(node) || !hasHan(node) || !rendered(node)) return false;
        seen.add(node);
        return true;
      });
      const details = candidates.map(({ selector, node }) => {
        const style = getComputedStyle(node);
        return {
          selector,
          tag: node.tagName,
          className: String(node.className),
          text: node.textContent.trim().slice(0, 80),
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          overflowWrap: style.overflowWrap,
          wordBreak: style.wordBreak,
          transform: style.transform,
          letterSpacing: style.letterSpacing,
          passes: wrapsNormally(node),
        };
      });
      const failures = details.filter((candidate) => !candidate.passes);
      const ok = config.outcome === 'required'
        ? candidates.length > 0 && failures.length === 0
        : candidates.length === 0;
      return {
        ok,
        outcome: config.outcome,
        reason: config.reason ?? null,
        selectors: config.selectors ?? ['body * leaf Han scan'],
        candidateCount: candidates.length,
        candidates: details,
        failures,
      };
    })()`,
  );
  await assertPage(
    `${viewport.name} ${state.name} anywhere wrapping is limited to URL and path values`,
    `(() => {
      const rendered = [...document.querySelectorAll('body *')].filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
      });
      const markers = rendered.filter((node) => node.matches('[data-wrap-kind="url"],[data-wrap-kind="path"]'));
      const anywhere = rendered.filter((node) => getComputedStyle(node).overflowWrap === 'anywhere');
      const inspector = document.querySelector('.drawer');
      const inspectorPathSection = document.querySelector('.inspector-note-path');
      return anywhere.every((node) => Boolean(node.closest('[data-wrap-kind="url"],[data-wrap-kind="path"]')))
        && markers.every((node) => node.textContent.trim().length > 0 && getComputedStyle(node).overflowWrap === 'anywhere')
        && (!inspector || !inspectorPathSection || markers.some((node) => node.matches('[data-wrap-kind="path"]')));
    })()`,
  );
  await assertPage(
    `${viewport.name} ${state.name} AgentPixel CJK font is available`,
    "document.fonts.check('12px AgentPixel', '\u4ea7\u54c1\u4e0e\u524d\u7aef\u5f00\u53d1')",
  );
  await assertPage(
    `${viewport.name} ${state.name} AgentReading CJK font is available`,
    "document.fonts.check('14px AgentReading', '\u8fc7\u53bb\u4e00\u5468\u5185\u503c\u5f97\u5173\u6ce8\u7684 AI \u6d88\u606f')",
  );

  if (state.surface !== "console") return;

  await assertPage(
    `${viewport.name} ${state.name} all four navigation entries remain inside viewport`,
    `(() => {
      const nav = document.querySelector('.topnav')?.getBoundingClientRect();
      const entries = [...document.querySelectorAll('.topnav .nav-button')].map((node) => node.getBoundingClientRect());
      const inside = (box) => box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
      return Boolean(nav) && entries.length === 4 && inside(nav) && entries.every(inside);
    })()`,
  );
  await assertPage(
    `${viewport.name} ${state.name} search portal and cards remain inside viewport`,
    `(() => {
      const nodes = [
        document.querySelector('.librarian-search'),
        document.querySelector('.librarian-galaxy-portal'),
        ...document.querySelectorAll('.ranked-skill-card'),
      ].filter(Boolean);
      return nodes.length >= 2 && nodes.every((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.width <= innerWidth && box.bottom > 0;
      });
    })()`,
  );

  if (state.name !== "librarian-search") return;

  await assertPage(
    `${viewport.name} submitted cards stack in one column`,
    `(() => {
      const boxes = [...document.querySelectorAll('.ranked-skill-card')].map((node) => node.getBoundingClientRect());
      return boxes.length === 3
        && boxes.every((box) => box.width > innerWidth * 0.75)
        && boxes.slice(1).every((box, index) => box.top >= boxes[index].bottom - 1);
    })()`,
  );
  await assertPage(
    `${viewport.name} submitted galaxy preview is a shallow landscape region`,
    `(() => {
      const box = document.querySelector('.librarian-page.is-searching .librarian-galaxy-portal')?.getBoundingClientRect();
      return Boolean(box && box.width >= box.height * 1.8 && box.height <= Math.min(220, innerHeight * 0.3));
    })()`,
  );
  await assertPage(
    `${viewport.name} primary result cards avoid severe overlap`,
    `(() => {
      const boxes = [...document.querySelectorAll('.ranked-skill-card')].map((node) => node.getBoundingClientRect());
      return boxes.length === 3 && boxes.every((box, index) => boxes.slice(index + 1).every((other) => {
        const width = Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left));
        const height = Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top));
        const smaller = Math.min(box.width * box.height, other.width * other.height);
        return smaller === 0 || (width * height) / smaller <= 0.08;
      }));
    })()`,
  );
}

async function assertPrimaryControlsDoNotOverlap(viewport, state) {
  await assertPage(
    `${viewport.name} ${state.name} primary controls avoid serious overlap`,
    `(() => {
      const nodes = [...document.querySelectorAll([
        '.topnav > .nav-button',
        '.ranked-skill-card',
        '.catalog-category-card',
        '.function-rail-item',
        '.unit-card',
        '.outcome-history-item',
        '[data-surface="outcome-composer"] input',
        '[data-surface="outcome-composer"] textarea',
        '[data-surface="outcome-composer"] button',
        '[data-surface="skill-inspector"] button',
      ].join(','))].filter((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return !node.closest('[inert],[aria-hidden="true"]')
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && box.width > 0
          && box.height > 0;
      });
      const boxes = nodes.map((node) => ({ node, box: node.getBoundingClientRect() }));
      return document.documentElement.scrollWidth <= innerWidth + 1
        && boxes.every(({ node, box }, index) => boxes.slice(index + 1).every(({ node: otherNode, box: other }) => {
          if (node.contains(otherNode) || otherNode.contains(node)) return true;
          const width = Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left));
          const height = Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top));
          const smaller = Math.min(box.width * box.height, other.width * other.height);
          return smaller === 0 || (width * height) / smaller <= 0.08;
        }));
    })()`,
  );
}

async function assertOverlay(viewport, state) {
  if (state.name === "inspector") {
    await assertPage(
      `${viewport.name} verified Inspector has modal semantics and isolates the app`,
      "Boolean(document.querySelector('[data-surface=\"skill-inspector\"][role=\"dialog\"][aria-modal=\"true\"][aria-labelledby][aria-describedby]') && document.querySelector('.app-content')?.inert)",
    );
    if (viewport.mobile) {
      await assertPageResult(
        "mobile verified Inspector contains every control without horizontal scrolling",
        `(() => {
          const dialog = document.querySelector('[data-surface="skill-inspector"]');
          const controls = [...(dialog?.querySelectorAll('button,a[href]') ?? [])];
          const dialogBox = dialog?.getBoundingClientRect();
          const failures = controls.filter((control) => {
            const box = control.getBoundingClientRect();
            return !dialogBox || box.left < dialogBox.left - 1 || box.right > dialogBox.right + 1;
          }).map((control) => ({
            className: String(control.className),
            text: control.textContent.trim().slice(0, 60),
            box: control.getBoundingClientRect().toJSON(),
          }));
          return {
            ok: Boolean(dialog) && dialog.scrollWidth <= dialog.clientWidth + 1 && failures.length === 0,
            scrollWidth: dialog?.scrollWidth ?? null,
            clientWidth: dialog?.clientWidth ?? null,
            failures,
          };
        })()`,
      );
      await assertPageResult(
        "mobile verified Inspector sticky header covers the drawer top after bottom scroll",
        `(async () => {
          const dialog = document.querySelector('[data-surface="skill-inspector"]');
          if (!dialog) return { ok: false, reason: 'missing drawer' };
          dialog.scrollTop = dialog.scrollHeight;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const dialogBox = dialog.getBoundingClientRect();
          const header = dialog.querySelector('.drawer-header');
          const headerBox = header?.getBoundingClientRect();
          const closeBox = dialog.querySelector('.icon-button')?.getBoundingClientRect();
          const sample = {
            x: dialogBox.left + dialogBox.width / 2,
            y: dialogBox.top + 1,
          };
          const hit = document.elementFromPoint(sample.x, sample.y);
          const headerStyle = header && getComputedStyle(header);
          const backgroundAlpha = Number(headerStyle?.backgroundColor.match(/[\d.]+/g)?.[3] ?? 1);
          const headerCoversTop = Boolean(header && headerBox
            && headerBox.top <= dialogBox.top + 1
            && headerBox.bottom > dialogBox.top + 1
            && header.contains(hit));
          const closeVisible = Boolean(closeBox
            && closeBox.width >= 44
            && closeBox.height >= 44
            && closeBox.top >= dialogBox.top
            && closeBox.bottom <= Math.min(dialogBox.bottom, innerHeight));
          return {
            ok: dialog.scrollTop > 0 && headerCoversTop && backgroundAlpha > 0 && closeVisible,
            scrollTop: dialog.scrollTop,
            scrollHeight: dialog.scrollHeight,
            clientHeight: dialog.clientHeight,
            dialogTop: dialogBox.top,
            headerTop: headerBox?.top ?? null,
            headerBottom: headerBox?.bottom ?? null,
            headerCoversTop,
            topSample: sample,
            topHitClass: hit?.className ? String(hit.className) : hit?.tagName ?? null,
            background: headerStyle?.backgroundColor ?? null,
            closeVisible,
          };
        })()`,
      );
    }
    return;
  }

  if (viewport.mobile) {
    const overflowViewport = { ...viewport, height: 480 };
    await setViewport(overflowViewport);
    await wait(150);
    await assertPageResult(
      `${viewport.name} Outcome Composer proves internal overflow scroll with persistent chrome`,
      `(async () => {
        const body = document.querySelector('.outcome-composer-body');
        const dialog = document.querySelector('.outcome-composer');
        const header = document.querySelector('.outcome-composer-header');
        const footer = document.querySelector('.outcome-composer-actions');
        const close = document.querySelector('.outcome-composer-close');
        if (!body || !dialog || !header || !footer || !close) {
          return { ok: false, reason: 'missing composer structure' };
        }
        const beforeScrollTop = body.scrollTop;
        body.scrollTop = body.scrollHeight;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const dialogBox = dialog.getBoundingClientRect();
        const headerBox = header.getBoundingClientRect();
        const footerBox = footer.getBoundingClientRect();
        const closeBox = close.getBoundingClientRect();
        const inside = (box) => box.left >= dialogBox.left
          && box.right <= dialogBox.right
          && box.top >= Math.max(dialogBox.top, 0)
          && box.bottom <= Math.min(dialogBox.bottom, innerHeight);
        return {
          ok: body.scrollHeight > body.clientHeight
            && beforeScrollTop === 0
            && body.scrollTop > beforeScrollTop
            && inside(headerBox)
            && inside(footerBox)
            && inside(closeBox)
            && closeBox.width >= 44
            && closeBox.height >= 44,
          testViewport: { width: innerWidth, height: innerHeight },
          scrollHeight: body.scrollHeight,
          clientHeight: body.clientHeight,
          beforeScrollTop,
          afterScrollTop: body.scrollTop,
          headerVisible: inside(headerBox),
          footerVisible: inside(footerBox),
          closeVisible: inside(closeBox),
          closeSize: { width: closeBox.width, height: closeBox.height },
        };
      })()`,
    );
    await setViewport(viewport);
    await wait(150);
    await assertPage(
      "mobile Outcome Composer restores the 390x820 capture viewport",
      `innerWidth === ${viewport.width} && innerHeight === ${viewport.height} && Boolean(document.querySelector('.outcome-composer'))`,
    );
    return;
  }

  await evaluate("(() => { const body = document.querySelector('.outcome-composer-body'); if (body) body.scrollTop = body.scrollHeight; return true; })()");
  await wait(100);
  await assertPage(
    `${viewport.name} Outcome Composer close remains visible after internal scroll`,
    "Boolean(document.querySelector('.outcome-composer-close'))",
  );
}

async function runState(viewport, state) {
  await setViewport(viewport);
  await resetToConsole(`${viewport.name} ${state.name}`);
  await state.enter();
  if (state.surface === "console") await assertConsole(viewport, state);
  else if (state.surface === "orbit") await assertOrbit(viewport, state);
  else if (state.surface === "overlay") await assertOverlay(viewport, state);
  await assertHorizontalRailReachability(viewport, state);
  if (viewport.mobile && state.name === "history-one-outcome") {
    await evaluate("document.querySelector('.outcome-history-item')?.scrollIntoView({ block: 'center' }); true");
    await wait(100);
  }
  await assertPrimaryControlsDoNotOverlap(viewport, state);
  await captureScreenshot(viewport, state, await readPageState());
  await assertMobileViewport(viewport, state);
  if (viewport.mobile && state.name === "history-one-outcome") {
    await assertMobileHistoryTargets();
  }
  if (viewport.mobile && state.name === "orbit-library") {
    await assertMobileLibraryContextNavigation();
  }
}

async function assertMobileHistoryTargets() {
  await assertPageResult(
    "mobile History export import and delete targets are at least 44px",
    `(() => {
      const selectors = ['.outcome-export', '.outcome-import', '.outcome-delete'];
      const targets = selectors.map((selector) => ({ selector, node: document.querySelector(selector) }));
      const failures = targets.filter(({ node }) => {
        const box = node?.getBoundingClientRect();
        return !box || box.width < 44 || box.height < 44;
      }).map(({ selector, node }) => {
        const box = node?.getBoundingClientRect();
        return { selector, width: box?.width ?? 0, height: box?.height ?? 0 };
      });
      return { ok: failures.length === 0, failures };
    })()`,
  );
  await clickBySelector(".outcome-delete");
  await wait(100);
  await assertPageResult(
    "mobile History delete confirmation targets are native and at least 44px",
    `(() => {
      const group = document.querySelector('.outcome-delete-confirm[role="group"]');
      const selectors = ['.outcome-delete-cancel', '.outcome-delete-confirm-button'];
      const targets = selectors.map((selector) => ({ selector, node: group?.querySelector(selector) }));
      const failures = targets.filter(({ node }) => {
        const box = node?.getBoundingClientRect();
        return !box || box.width < 44 || box.height < 44;
      }).map(({ selector, node }) => {
        const box = node?.getBoundingClientRect();
        return { selector, width: box?.width ?? 0, height: box?.height ?? 0 };
      });
      return { ok: Boolean(group) && failures.length === 0, failures };
    })()`,
  );
  await clickBySelector(".outcome-delete-cancel");
  await wait(100);
  await assertPage(
    "mobile History confirmation probe preserves its one local outcome",
    "!document.querySelector('.outcome-delete-confirm') && document.querySelectorAll('.outcome-history-item').length === 1 && JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1')).outcomes.length === 1",
  );
}

async function assertMobileLibraryContextNavigation() {
  const hasContextNav = await evaluate("Boolean(document.querySelector('.orbit-mobile-context-nav'))");
  if (!hasContextNav) {
    await assertPage("mobile library context navigation switches sibling libraries", "false");
    await assertPage("mobile library context navigation returns to category", "false");
    return;
  }

  const siblingId = await evaluate("document.querySelector('.orbit-mobile-context-nav button[data-station-id]:not([aria-current=\"page\"])')?.getAttribute('data-station-id') ?? null");
  await clickBySelector(`.orbit-mobile-context-nav button[data-station-id=${JSON.stringify(siblingId)}]`);
  await wait(220);
  await assertPage(
    "mobile library context navigation switches sibling libraries",
    `document.querySelector('.silent-orbit-page')?.getAttribute('data-view-mode') === 'library'
      && document.querySelector('.orbit-mobile-context-nav button[aria-current="page"]')?.getAttribute('data-station-id') === ${JSON.stringify(siblingId)}
      && document.querySelector('.library-moon[aria-pressed="true"]')?.getAttribute('data-station-id') === ${JSON.stringify(siblingId)}`,
  );
  await clickBySelector(".orbit-mobile-context-nav button[data-system-id]");
  await wait(220);
  await assertPage(
    "mobile library context navigation returns to category",
    "document.querySelector('.silent-orbit-page')?.getAttribute('data-view-mode') === 'category' && Boolean(document.querySelector('.library-moon'))",
  );
}

async function assertReducedMotion() {
  await setViewport(viewports[0]);
  const initialReducedMotion = await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  try {
    await resetToConsole("desktop reduced-motion");
    await enterLibrarianSearch();
    await assertPage(
      "reduced motion preserves the submitted final layout state",
      `(() => {
        const preview = document.querySelector('.librarian-page.is-searching .portal-map');
        const cards = [...document.querySelectorAll('.ranked-skill-card')];
        const previewStyle = preview && getComputedStyle(preview);
        return Boolean(previewStyle)
          && previewStyle.transform !== 'none'
          && previewStyle.transitionDuration.split(',').every((value) => Number.parseFloat(value) === 0)
          && cards.length === 3
          && cards.every((card) => {
            const style = getComputedStyle(card);
            return style.animationName === 'none' && Number(style.opacity) === 1 && style.transform === 'none';
          });
      })()`,
    );
    await resetToConsole("desktop reduced-motion direct entry");
    await clickBySelector('.portal-system-hit[data-system-id="zone:个人知识库与本地工具"]');
    await wait(100);
    await assertPage("reduced motion opens Orbit", "Boolean(document.querySelector('.silent-orbit-page'))");
    await assertPage(
      "reduced motion disables stars",
      "(() => { const stars = [...document.querySelectorAll('.orbit-star,.orbit-star-field circle')]; return stars.length > 0 && stars.every((node) => getComputedStyle(node).animationName === 'none'); })()",
    );
  } finally {
    await cdp("Emulation.setEmulatedMedia", { features: [] });
  }
  await resetToConsole("desktop restored-motion");
  await assertPage(
    "reduced-motion media state restored",
    `matchMedia('(prefers-reduced-motion: reduce)').matches === ${JSON.stringify(initialReducedMotion)}`,
  );
}

function updateSummary() {
  const errors = manifest.consoleIssues.filter((issue) => issue.type === "exception" || issue.type === "error");
  manifest.summary.screenshotCount = manifest.screenshots.length;
  manifest.summary.inspectorCount = manifest.screenshots.filter((shot) => shot.state === "inspector").length;
  manifest.summary.outcomeComposerCount = manifest.screenshots.filter((shot) => shot.state === "outcome-composer").length;
  manifest.summary.consoleRuntimeErrorCount = errors.length;
  manifest.stateCoverage = viewports.map((viewport) => {
    const captured = manifest.screenshots.filter((shot) => shot.viewport === viewport.name).map((shot) => shot.state);
    return {
      viewport: viewport.name,
      captured,
      missing: requiredVisualStates.filter((state) => !captured.includes(state)),
      unexpected: captured.filter((state) => !requiredVisualStates.includes(state)),
      duplicates: captured.filter((state, index) => captured.indexOf(state) !== index),
    };
  });
}

function writeReport() {
  const lines = [
    "# Observatory Librarian v0.4 Visual QA Matrix",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Target: ${manifest.targetUrl}`,
    `Screenshots: ${manifest.summary.screenshotCount}/${manifest.summary.expectedScreenshots}`,
    `States per viewport: ${manifest.summary.expectedStatesPerViewport}`,
    `Inspectors: ${manifest.summary.inspectorCount}/${manifest.summary.expectedInspectors}`,
    `Outcome composers: ${manifest.summary.outcomeComposerCount}/${manifest.summary.expectedOutcomeComposers}`,
    `Console/runtime errors: ${manifest.summary.consoleRuntimeErrorCount}`,
    `Required states: ${manifest.requiredStates.join(", ")}`,
    "",
    "## Checks",
    "",
    "| Check | Result |",
    "| --- | --- |",
    ...manifest.checks.map((check) => `| ${check.label} | ${check.ok ? "pass" : "fail"} |`),
    "",
    "## Screenshots",
    "",
    "| Viewport | State | Runtime state | Screenshot |",
    "| --- | --- | --- | --- |",
    ...manifest.screenshots.map((shot) => {
      const runtime = [
        `surface=${shot.pageState.surface}`,
        `mode=${shot.pageState.viewMode}`,
        `libraries=${shot.pageState.libraries}`,
        `skills=${shot.pageState.skillAsteroids}`,
        `panel=${shot.pageState.panelVisible}`,
      ].join("<br>");
      const file = path.basename(shot.file);
      return `| ${shot.viewport} | ${shot.state} | ${runtime} | ![${shot.viewport} ${shot.state}](./${file}) |`;
    }),
    "",
    "## Console Issues",
    "",
    manifest.consoleIssues.length === 0
      ? "No browser console/runtime issues were captured."
      : manifest.consoleIssues.map((issue) => `- ${issue.type}: ${issue.text}`).join("\n"),
    "",
  ];
  fs.writeFileSync(path.join(outputDir, "visual-qa-matrix.md"), `${lines.join("\n")}\n`);
}

function writeOutputs() {
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeReport();
}

function publishStableEvidence() {
  fs.mkdirSync(stableEvidenceDir, { recursive: true });
  const evidence = [
    ["desktop-01-librarian-idle.png", "desktop-librarian-idle.png"],
    ["desktop-02-librarian-search.png", "desktop-librarian-submitted.png"],
    ["desktop-11-maintenance.png", "desktop-maintenance.png"],
    ["mobile-01-librarian-idle.png", "mobile-librarian-idle.png"],
    ["mobile-02-librarian-search.png", "mobile-librarian-submitted.png"],
    ["mobile-11-maintenance.png", "mobile-maintenance.png"],
  ];
  for (const [source, target] of evidence) {
    fs.copyFileSync(path.join(outputDir, source), path.join(stableEvidenceDir, target));
  }
}

const viewports = [
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  { name: "mobile", width: 390, height: 820, deviceScaleFactor: 1, mobile: true },
];

const states = [
  { order: "01", name: "librarian-idle", surface: "console", enter: async () => wait(150) },
  { order: "02", name: "librarian-search", surface: "console", enter: enterLibrarianSearch },
  { order: "03", name: "catalog-overview", surface: "catalog", enter: enterCatalogOverview },
  { order: "04", name: "catalog-category", surface: "catalog", enter: enterCatalogCategory },
  { order: "05", name: "orbit-category", surface: "orbit", mode: "category", enter: enterOrbitCategory },
  { order: "06", name: "orbit-library", surface: "orbit", mode: "library", enter: enterOrbitLibrary },
  { order: "07", name: "inspector", surface: "overlay", enter: enterVerifiedInspector },
  { order: "08", name: "outcome-composer", surface: "overlay", enter: enterOutcomeComposer },
  { order: "09", name: "history-one-outcome", surface: "history", enter: enterHistoryWithOneOutcome },
  { order: "10", name: "librarian-system-hover", surface: "console", enter: enterLibrarianSystemHover },
  { order: "11", name: "maintenance", surface: "maintenance", enter: enterMaintenance },
];

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Emulation.setEmulatedMedia", { features: [] });

  for (const viewport of viewports) {
    manifest.viewports.push(viewport);
    for (const state of states) {
      await runState(viewport, state);
    }
  }

  await assertReducedMotion();
  updateSummary();
  assertPortableScreenshotManifest();
  if (manifest.summary.screenshotCount !== manifest.summary.expectedScreenshots
    || manifest.stateCoverage.some((coverage) => coverage.captured.length !== requiredVisualStates.length
      || coverage.missing.length > 0
      || coverage.unexpected.length > 0
      || coverage.duplicates.length > 0)) {
    throw new Error(`Visual QA matrix mismatch: captured ${manifest.summary.screenshotCount}/${manifest.summary.expectedScreenshots}; ${JSON.stringify(manifest.stateCoverage)}.`);
  }
  if (manifest.summary.inspectorCount !== manifest.summary.expectedInspectors) {
    throw new Error(`Visual QA captured ${manifest.summary.inspectorCount} Inspector states; expected 2.`);
  }
  if (manifest.summary.outcomeComposerCount !== manifest.summary.expectedOutcomeComposers) {
    throw new Error(`Visual QA captured ${manifest.summary.outcomeComposerCount} Outcome Composer states; expected 2.`);
  }
  const errors = manifest.consoleIssues.filter((issue) => issue.type === "exception" || issue.type === "error");
  if (errors.length > 0) {
    throw new Error(`Visual QA saw ${errors.length} console/runtime errors.`);
  }
  const failedChecks = manifest.checks.filter((check) => !check.ok);
  if (failedChecks.length > 0) {
    throw new Error(`Visual QA failed ${failedChecks.length} checks: ${failedChecks.map((check) => check.label).join("; ")}`);
  }
  publishStableEvidence();
} finally {
  updateSummary();
  writeOutputs();
  await cleanup();
}
