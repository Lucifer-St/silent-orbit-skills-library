import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview as startPreview } from "vite";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = path.join(projectDir, ".chrome-smoke-profile");
const previewPort = Number(process.env.SMOKE_PORT ?? 0);
const debugPort = process.env.SMOKE_DEBUG_PORT ? Number(process.env.SMOKE_DEBUG_PORT) : await getFreePort();
const orbitReviewCase = process.env.SMOKE_ORBIT_REVIEW_CASE ?? null;

function shouldRunOrbitReviewCase(name) {
  return orbitReviewCase === null || orbitReviewCase === name;
}

if (!fs.existsSync(chromePath)) {
  throw new Error(`Chrome not found at ${chromePath}`);
}

if (fs.existsSync(profileDir)) {
  fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
fs.mkdirSync(profileDir, { recursive: true });

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

async function cleanup() {
  socket?.close();
  chrome?.kill();
  await preview?.close();
  await wait(750);
  if (fs.existsSync(profileDir)) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    } catch (error) {
      console.warn(`warning: could not remove temporary smoke profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function getJson(url, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await wait(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let id = 0;
const pending = new Map();
const browserIssues = [];

try {
  preview = process.env.SMOKE_URL
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
    process.env.SMOKE_URL ??
    (previewAddress && typeof previewAddress !== "string" ? `http://127.0.0.1:${previewAddress.port}/` : null);
  if (!targetUrl) throw new Error("Could not resolve the smoke preview URL.");

  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1440,1100",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${debugPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
  const pageTarget = targets.find((target) => target.type === "page");
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error("Could not find a Chrome page target for smoke testing.");
  }
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      browserIssues.push({
        type: "exception",
        text: message.params?.exceptionDetails?.text ?? "Runtime exception",
      });
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
      browserIssues.push({
        type: message.params.type,
        text: message.params.args?.map((argument) => argument.value ?? argument.description ?? argument.type).join(" ") ?? "console error",
      });
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      browserIssues.push({ type: "log", text: message.params.entry.text ?? "browser log error" });
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

async function assertPage(label, expression) {
  const ok = await evaluate(expression);
  if (!ok) {
    throw new Error(`UI smoke failed: ${label}`);
  }
  console.log(`ok ${label}`);
}

async function waitForPage(label, expression, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await evaluate(expression)) {
      console.log(`ok ${label}`);
      return;
    }
    await wait(50);
  } while (Date.now() < deadline);
  throw new Error(`UI smoke failed: ${label}`);
}

async function assertChineseFonts(label) {
  await evaluate("document.fonts.ready.then(() => true)");
  await assertPage(
    `${label} loads AgentPixel Chinese glyphs`,
    "document.fonts.check('12px AgentPixel', '\\u4ea7\\u54c1\\u4e0e\\u524d\\u7aef\\u5f00\\u53d1')",
  );
  await assertPage(
    `${label} loads AgentReading Chinese glyphs`,
    "document.fonts.check('14px AgentReading', '\\u8fc7\\u53bb\\u4e00\\u5468\\u5185\\u503c\\u5f97\\u5173\\u6ce8\\u7684 AI \\u6d88\\u606f')",
  );
}

async function assertKeyboardFocusOutline(label, selector, maxTabs = 32) {
  await evaluate("document.activeElement instanceof HTMLElement && document.activeElement.blur(); true");
  for (let step = 0; step < maxTabs; step += 1) {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    if (await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`)) break;
  }

  const result = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return { ok: false, reason: 'missing input' };
    const style = getComputedStyle(input);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    const focusVisible = input.matches(':focus-visible');
    const outlineColor = style.outlineColor;
    return {
      ok: document.activeElement === input
        && focusVisible
        && style.outlineStyle !== 'none'
        && Number.isFinite(outlineWidth)
        && outlineWidth > 0
        && outlineColor !== 'transparent'
        && outlineColor !== 'rgba(0, 0, 0, 0)',
      activeElement: document.activeElement?.tagName ?? null,
      focusVisible,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor,
      outlineOffset: style.outlineOffset,
    };
  })()`);
  if (!result.ok) {
    throw new Error(`UI smoke failed: ${label}; ${JSON.stringify(result)}`);
  }
  console.log(
    `ok ${label} focusVisible=${result.focusVisible} outline=${result.outlineWidth} ${result.outlineStyle} ${result.outlineColor} offset=${result.outlineOffset}`,
  );
}

async function assertOneBitPalette(label, selectors) {
  const expression = `(() => {
    const parseColor = (value) => {
      const channels = value.match(/-?\\d*\\.?\\d+/g)?.map(Number) ?? [];
      if (channels.length < 3) return null;
      return {
        rgb: channels.slice(0, 3).map((channel) => Math.round(channel)).join(','),
        alpha: channels.length > 3 ? channels[3] : 1,
      };
    };
    const resolveToken = (token) => {
      const probe = document.createElement('span');
      probe.style.color = token.trim();
      document.body.append(probe);
      const resolved = parseColor(getComputedStyle(probe).color)?.rgb ?? null;
      probe.remove();
      return resolved;
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const allowed = new Set([
      resolveToken(rootStyle.getPropertyValue('--void')),
      resolveToken(rootStyle.getPropertyValue('--signal')),
    ]);
    const effectiveBackground = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const background = parseColor(getComputedStyle(current).backgroundColor);
        if (background && background.alpha > 0) return background.rgb;
      }
      return null;
    };
    const inspect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, ok: false, reason: 'missing' };
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color)?.rgb ?? null;
      const background = effectiveBackground(element);
      const borders = ['Top', 'Right', 'Bottom', 'Left'].flatMap((side) => {
        const width = Number.parseFloat(style['border' + side + 'Width']);
        const kind = style['border' + side + 'Style'];
        if (!Number.isFinite(width) || width <= 0 || kind === 'none') return [];
        return [parseColor(style['border' + side + 'Color'])?.rgb ?? null];
      });
      const ok = allowed.has(foreground) && allowed.has(background) && foreground !== background && borders.every((border) => allowed.has(border));
      return { selector, ok, foreground, background, borders };
    };
    const results = ${JSON.stringify(selectors)}.map(inspect);
    return { ok: results.every((result) => result.ok), failures: results.filter((result) => !result.ok) };
  })()`;
  const result = await evaluate(expression);
  if (!result.ok) {
    throw new Error(`UI smoke failed: ${label}; ${JSON.stringify(result.failures)}`);
  }
  console.log(`ok ${label}`);
}

async function assertOrbitFocusGeometry(label, focusSelector, geometrySelector = null, tolerance = 18) {
  const result = await evaluate(`(() => {
    const scene = document.querySelector('.orbit-scene');
    const focus = document.querySelector(${JSON.stringify(focusSelector)});
    const geometry = ${geometrySelector ? `document.querySelector(${JSON.stringify(geometrySelector)})` : "null"};
    if (!scene || !focus || (${Boolean(geometrySelector)} && !geometry)) {
      return { ok: false, reason: 'missing geometry target' };
    }
    const center = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const sceneCenter = center(scene.getBoundingClientRect());
    const focusCenter = center(focus.getBoundingClientRect());
    const geometryCenter = geometry ? center(geometry.getBoundingClientRect()) : null;
    const centerError = Math.hypot(focusCenter.x - sceneCenter.x, focusCenter.y - sceneCenter.y);
    const alignmentError = geometryCenter
      ? Math.hypot(focusCenter.x - geometryCenter.x, focusCenter.y - geometryCenter.y)
      : 0;
    return {
      ok: centerError <= ${tolerance} && alignmentError <= ${tolerance},
      centerError: Math.round(centerError * 10) / 10,
      alignmentError: Math.round(alignmentError * 10) / 10,
      sceneCenter,
      focusCenter,
      geometryCenter,
    };
  })()`);
  if (!result.ok) {
    throw new Error(`UI smoke failed: ${label}; ${JSON.stringify(result)}`);
  }
  console.log(`ok ${label} centerError=${result.centerError}px alignmentError=${result.alignmentError}px`);
}

async function activateAtRenderedCenter(label, selector) {
  const result = await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) return { ok: false, reason: 'missing target', selector: ${JSON.stringify(selector)} };
    const box = target.getBoundingClientRect();
    const point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const hit = document.elementFromPoint(point.x, point.y);
    const style = getComputedStyle(target);
    return {
      ok: box.width >= 8
        && box.height >= 8
        && point.x >= 0
        && point.x <= innerWidth
        && point.y >= 0
        && point.y <= innerHeight
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none'
        && Boolean(hit && (hit === target || target.contains(hit))),
      selector: ${JSON.stringify(selector)},
      point,
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
      hit: hit ? {
        tag: hit.tagName,
        className: String(hit.className),
        id: hit.id,
        systemId: hit.closest('[data-system-id]')?.getAttribute('data-system-id') ?? null,
        stationId: hit.closest('[data-station-id]')?.getAttribute('data-station-id') ?? null,
        skillId: hit.closest('[data-skill-id]')?.getAttribute('data-skill-id') ?? null,
      } : null,
    };
  })()`);
  if (!result.ok) {
    throw new Error(`UI smoke failed: ${label}; ${JSON.stringify(result)}`);
  }
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: result.point.x, y: result.point.y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: result.point.x, y: result.point.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: result.point.x, y: result.point.y, button: "left", clickCount: 1 });
  console.log(`ok ${label} center=(${Math.round(result.point.x)},${Math.round(result.point.y)})`);
}

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.navigate", { url: targetUrl });
  await wait(1200);

  await assertPage(
    "locale toggle starts in Chinese and exposes a valid desktop control",
    "(() => { const button = document.querySelector('.language-toggle'); const box = button?.getBoundingClientRect(); return document.documentElement.lang === 'zh-CN' && button?.textContent.trim() === 'EN' && box.width >= 44 && box.height >= 34; })()",
  );
  await evaluate("document.querySelector('.language-toggle')?.click(); true");
  await wait(150);
  await assertPage(
    "locale toggle switches the live interface to English",
    "document.documentElement.lang === 'en-US' && document.querySelector('.librarian-search-label')?.textContent.trim() === 'WHAT DO YOU NEED?' && localStorage.getItem('skills-library-locale-v1') === 'en-US'",
  );
  await cdp("Page.reload", { ignoreCache: true });
  await wait(900);
  await assertPage(
    "English locale survives reload",
    "document.documentElement.lang === 'en-US' && document.querySelector('.librarian-search-label')?.textContent.trim() === 'WHAT DO YOU NEED?'",
  );
  await evaluate("document.querySelector('.language-toggle')?.click(); true");
  await wait(150);
  await assertPage(
    "locale can return to Chinese without losing the page",
    "Boolean(document.documentElement.lang === 'zh-CN' && document.querySelector('.librarian-search-label')?.textContent.trim() === '你想完成什么？' && document.querySelector('[data-page=\"librarian\"]'))",
  );

  await assertChineseFonts("desktop");
  await evaluate(`fetch(new URL('data/skill-details.json', location.href))
    .then((response) => response.json())
    .then((records) => { window.__smokeVerifiedDetails = records; return true; })`);
  await assertPage(
    "verified source details are limited to the five explicit records",
    `(() => {
      const records = window.__smokeVerifiedDetails;
      return Array.isArray(records)
        && records.map((record) => record.skill).join('|') === 'skill-installer|find-skills|skill-creator|html-ppt|humanizer-zh'
        && records.every((record) => record.author?.trim()
          && record.sourceSummary?.trim()
          && /^https:\\/\\//.test(record.sourceUrl)
          && record.examples?.length > 0
          && record.examples.every((example) => example.title?.trim() && /^https:\\/\\//.test(example.url)));
    })()`,
  );
  await assertPage("librarian home exists", "Boolean(document.querySelector('[data-page=\"librarian\"]'))");
  await assertPage("observatory portal is one control", "document.querySelectorAll('.librarian-galaxy-portal').length === 1");
  await assertPage("idle librarian has no ranked cards", "document.querySelectorAll('.ranked-skill-card').length === 0");
  await assertPage("Librarian live region stays mounted while idle", "Boolean(document.querySelector('.librarian-status[aria-live=\"polite\"]')) && document.querySelector('.librarian-status')?.textContent === ''");
  await assertPage("librarian replaces old home dashboard", "Boolean(document.querySelector('.agent-console[data-surface=\"console\"] .librarian-page')) && !document.querySelector('.function-rail,.command-deck,.task-matrix')");
  await assertPage(
    "top navigation exposes three surfaces plus locale control",
    "[...document.querySelectorAll('.topnav > .nav-button')].map((button) => button.textContent.trim()).join('|') === 'LIBRARIAN|CATALOG|HISTORY|EN'",
  );
  await assertKeyboardFocusOutline("librarian search shows keyboard focus outline", ".librarian-search input");
  await assertPage("system panels stay square", "[...document.querySelectorAll('.librarian-search,.ranked-skill-card,.silent-orbit-portal')].every((node)=>parseFloat(getComputedStyle(node).borderRadius)<=1)");
  await assertPage("portal exposes nine accessible direct System entries without an Overview entry", "Boolean(document.querySelector('section.silent-orbit-portal.librarian-galaxy-portal[aria-label]') && !document.querySelector('button.portal-entry-trigger') && document.querySelectorAll('.portal-system-hit[data-system-id]').length === 9 && document.querySelector('.silent-orbit-preview[aria-hidden=\"true\"]') && !document.querySelector('.silent-orbit-preview button'))");
  await assertPage("portal uses nine generated distant-ecliptic assets without circular reticles", `(() => {
    const svg = document.querySelector('.silent-orbit-preview');
    const markers = [...(svg?.querySelectorAll('image.portal-system-visual[data-system-marker-asset="distant-ecliptic"]') ?? [])];
    const allowedAssets = new Set(['/assets/system-ecliptic-a.png', '/assets/system-ecliptic-b.png', '/assets/system-ecliptic-c.png']);
    return markers.length === 9
      && markers.every((marker) => allowedAssets.has(marker.getAttribute('href')))
      && !svg?.querySelector('.portal-system-orbit,.portal-system-core,.portal-system-star > path')
      && [...document.querySelectorAll('.portal-system-hit')].every((button) => {
        const style = getComputedStyle(button);
        const box = button.getBoundingClientRect();
        return Number.parseFloat(style.borderRadius) === 0
          && style.backgroundColor === 'rgba(0, 0, 0, 0)'
          && style.clipPath.includes('circle')
          && box.width >= 96
          && box.height >= 96;
      });
  })()`);
  await assertPage("portal does not claim one featured system across the whole galaxy", "!document.querySelector('.portal-hover-detail,[data-featured]')");
  await assertPage("console omits interactive legacy map", "!document.querySelector('.agent-console .pixel-map-canvas') && !document.querySelector('.agent-console .function-zone-node')");
  await assertPage("idle Observatory uses the selected galaxy asset and preserves every catalog identity", `(() => {
    const svg = document.querySelector('.librarian-page.is-idle .silent-orbit-preview');
    const catalogNodes = [...(svg?.querySelectorAll('[data-catalog-node-id]') ?? [])];
    const skillTraces = [...(svg?.querySelectorAll('[data-skill-trace]') ?? [])];
    const asset = svg?.querySelector('image.portal-galaxy-asset');
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
      && svg.querySelectorAll('.portal-spiral-arm,.portal-nucleus-ring,.portal-skill-star').length === 0
      && svg.querySelectorAll('linearGradient,radialGradient,filter').length === 0;
  })()`);
  await evaluate("document.querySelector('.portal-system-hit[data-system-id]')?.focus(); true");
  await wait(220);
  await assertPage("focused System brightens and enlarges only its stellar asset", `(() => {
    const button = document.activeElement;
    const active = document.querySelector('.portal-system-star[data-active="true"]');
    const marker = active?.querySelector('.portal-system-visual');
    const buttonStyle = button && getComputedStyle(button);
    const markerStyle = marker && getComputedStyle(marker);
    const markerScale = markerStyle?.transform && markerStyle.transform !== 'none'
      ? new DOMMatrixReadOnly(markerStyle.transform).a
      : 1;
    return button?.matches('.portal-system-hit[data-system-id]')
      && Boolean(active && marker)
      && Number(markerStyle?.opacity ?? 0) >= .99
      && markerScale >= 1.4
      && buttonStyle?.outlineStyle === 'none'
      && buttonStyle?.boxShadow === 'none'
      && buttonStyle?.backgroundColor === 'rgba(0, 0, 0, 0)';
  })()`);
  await evaluate("document.activeElement?.blur(); true");
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.portal-system-hit[data-system-id]')]
      .find((button) => button.getAttribute('data-system-id')?.includes('个人知识库'));
    window.__smokeDirectSystemTrigger = trigger;
    window.__smokeDirectSystemReturnId = trigger?.getAttribute('data-orbit-return-id');
    trigger?.focus();
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(750);
  await assertPage(
    "homepage System entry opens its Category directly",
    "Boolean(document.querySelector('.silent-orbit-page[data-view-mode=\"category\"]') && document.querySelector('.celestial-system[data-active=\"true\"][data-system-id*=\"个人知识库\"]') && document.querySelectorAll('.library-moon').length > 0 && document.querySelectorAll('.skill-asteroid').length === 0)",
  );
  await evaluate("document.querySelector('.orbit-close')?.click(); true");
  await waitForPage(
    "direct Category close restores the exact remounted System entry",
    "Boolean(document.querySelector('.agent-console[data-surface=\"console\"]') && document.activeElement?.getAttribute('data-orbit-return-id') === window.__smokeDirectSystemReturnId && document.activeElement !== window.__smokeDirectSystemTrigger)",
    5000,
  );
  await evaluate("document.querySelector('.librarian-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "skill-installer" });
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(400);
  await assertPage(
    "known verified skill is discoverable",
    "[...document.querySelectorAll('.ranked-skill-card')].some((card) => card.textContent.toLowerCase().includes('skill-installer'))",
  );
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.ranked-skill-card')]
      .find((card) => card.textContent.toLowerCase().includes('skill-installer'));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(250);
  await assertPage(
    "known verified skill renders author source and example evidence",
    `(() => {
      const panel = document.querySelector('.inspector-source-details');
      return Boolean(window.__smokeVerifiedDetails.some((record) => record.skill === 'skill-installer')
        && panel
        && panel.querySelector('p strong')?.textContent.trim()
        && panel.querySelector('a.source-link[href]')
        && panel.querySelector('.inspector-source-example a[href]'));
    })()`,
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage("verified Inspector closes", "!document.querySelector('[role=\"dialog\"]')");
  await evaluate("document.querySelector('.librarian-clear')?.click(); true");
  await wait(200);
  await assertPage(
    "verified detail probe restores idle Librarian",
    "document.querySelector('.librarian-search input')?.value === '' && document.querySelectorAll('.ranked-skill-card').length === 0",
  );
  await evaluate("document.querySelector('.librarian-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "beautify-github-readme" });
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(300);
  await assertPage(
    "newly published Skill is discoverable in the local Librarian",
    "[...document.querySelectorAll('.ranked-skill-card')].some((card) => card.querySelector('strong')?.textContent.trim() === 'beautify-github-readme')",
  );
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.ranked-skill-card')]
      .find((card) => card.querySelector('strong')?.textContent.trim() === 'beautify-github-readme');
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(250);
  await assertPage(
    "newly published Skill Inspector exposes public third-party governance",
    "(() => { const dialog = document.querySelector('[data-surface=\"skill-inspector\"]'); return Boolean(dialog && dialog.textContent.includes('beautify-github-readme') && dialog.textContent.includes('第三方') && dialog.textContent.includes('公开')); })()",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage("newly published Skill Inspector closes", "!document.querySelector('[role=\"dialog\"]')");
  await evaluate("document.querySelector('.librarian-clear')?.click(); true");
  await wait(200);
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(100);
  await assertPage("empty submit keeps Librarian idle", "document.querySelector('.librarian-page.is-idle') && document.querySelectorAll('.ranked-skill-card').length === 0");
  await evaluate("document.querySelector('.librarian-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "过去一周内值得关注的 AI 消息" });
  await wait(250);
  await assertPage("typing keeps Librarian idle", "document.querySelector('.librarian-page.is-idle') && document.querySelectorAll('.ranked-skill-card').length === 0 && document.querySelector('.librarian-search input')?.value === '过去一周内值得关注的 AI 消息'");
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(500);
  await assertPage("submitted Librarian renders three ranked skill actions", "document.querySelector('.librarian-page.is-searching') && document.querySelectorAll('button.ranked-skill-card').length === 3");
  await assertPage("submitted Librarian updates its mounted live region", "document.querySelector('.librarian-status[aria-live=\"polite\"]')?.textContent.includes('3')");
  await evaluate("window.__smokeCatalogReturnUrl = location.href; [...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(300);
  await assertPage(
    "Catalog opens with functional categories as its first level",
    "(() => { const page = document.querySelector('[data-page=\"catalog\"]'); const cards = page?.querySelectorAll('.catalog-category-card') ?? []; return Boolean(page && cards.length > 0 && !document.querySelector('.function-rail,.command-deck') && !page.querySelector('.unit-card')); })()",
  );
  await assertPage(
    "Chinese display headings use the pixel family while body copy stays readable",
    "(() => { const heading = document.querySelector('[data-page=\"catalog\"] .page-header h1'); const copy = document.querySelector('[data-page=\"catalog\"] .page-header p'); return getComputedStyle(heading).fontFamily.includes('AgentPixel') && getComputedStyle(copy).fontFamily.includes('AgentReading'); })()",
  );
  await assertPage(
    "Catalog exposes its four reference-layer actions",
    "[...document.querySelectorAll('.catalog-secondary-action')].map((button) => `${button.getAttribute('data-catalog-target')}:${button.querySelector('strong')?.textContent.trim()}`).join('|') === 'private:PERSONAL DECK|sources:SOURCES|changes:CHANGES|maintenance:MAINTENANCE'",
  );
  await assertPage("Catalog uses one primary browsing model", "Boolean(document.querySelector('[data-page=\"catalog\"]') && !document.querySelector('.function-rail'))");
  await evaluate("document.querySelector('.catalog-category-card')?.click(); true");
  await wait(300);
  await assertPage("focused Catalog category keeps the function rail", "Boolean(document.querySelector('[data-page=\"category\"]') && document.querySelector('.function-rail'))");
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(200);
  await evaluate("document.querySelector('.catalog-secondary-action[data-catalog-target=\"private\"]')?.click(); true");
  await wait(250);
  await assertPage("secondary Catalog pages omit the function rail", "Boolean(document.querySelector('[data-page=\"private\"]')) && !document.querySelector('.function-rail')");
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'HISTORY')?.click(); true");
  await wait(250);
  await assertPage("History is a dedicated rail-free surface", "Boolean(document.querySelector('[data-page=\"history\"]')) && !document.querySelector('.function-rail')");
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'LIBRARIAN')?.click(); true");
  await wait(300);
  await assertPage(
    "returning to Librarian restores submitted search without URL state",
    "document.querySelector('.librarian-search input')?.value === '过去一周内值得关注的 AI 消息' && document.querySelectorAll('button.ranked-skill-card').length === 3 && location.href === window.__smokeCatalogReturnUrl && location.search === ''",
  );
  await assertPage(
    "weekly AI hard search renders its exact deterministic top three",
    "[...document.querySelectorAll('.ranked-skill-card')].map((card) => card.querySelector('strong')?.textContent.trim().toLowerCase()).join('|') === 'aihot|fengxue-ai-weekly|gmail'",
  );
  await assertPage("rank cards expose unique deterministic constellation visualizations", `(() => {
    const hashName = (value) => {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const cards = [...document.querySelectorAll('button.ranked-skill-card')];
    const signatures = cards.map((card) => {
      const visual = card.querySelector('.ranked-skill-constellation');
      const name = card.querySelector('strong')?.textContent ?? '';
      const geometry = [
        visual?.querySelector('path')?.getAttribute('d'),
        ...[...(visual?.querySelectorAll('circle') ?? [])].map((point) => point.getAttribute('cx') + ',' + point.getAttribute('cy')),
      ].join('|');
      return {
        signature: visual?.getAttribute('data-skill-signature'),
        geometry,
        valid: visual?.getAttribute('aria-hidden') === 'true'
          && getComputedStyle(visual).pointerEvents === 'none'
          && visual?.querySelectorAll('path').length === 1
          && visual?.querySelectorAll('circle').length >= 5,
        expected: hashName(name),
      };
    });
    return signatures.length === 3
      && signatures.every((item) => item.valid && item.signature === item.expected)
      && new Set(signatures.map((item) => item.signature)).size === 3
      && new Set(signatures.map((item) => item.geometry)).size === 3;
  })()`);
  await assertPage("rank cards remain one action each", "[...document.querySelectorAll('button.ranked-skill-card')].every((card) => card.querySelectorAll('button,a,[role=\"button\"],[tabindex]').length === 0)");
  await assertPage("rank cards omit score and percentage", "[...document.querySelectorAll('.ranked-skill-card')].every((card) => !/score|match|%/i.test(card.textContent))");
  await assertPage("submitted portal contracts to a shallow horizon", "document.querySelector('.librarian-galaxy-portal')?.getBoundingClientRect().height < 260");
  await assertPage("submitted horizon uses CSS compression without distorting SVG geometry", "document.querySelector('.librarian-page.is-searching .silent-orbit-preview')?.getAttribute('preserveAspectRatio') === 'xMidYMax slice' && getComputedStyle(document.querySelector('.librarian-page.is-searching .portal-map')).transform !== 'none'");
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.ranked-skill-card')]
      .find((card) => card.textContent.toLowerCase().includes('aihot'));
    window.__smokeAihotTrigger = trigger;
    trigger?.focus();
    return Boolean(trigger);
  })()`);
  await assertPage("aihot ranked action receives keyboard focus", "document.activeElement === window.__smokeAihotTrigger");
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await wait(250);
  await assertPage(
    "aihot opens Inspector by keyboard",
    "Boolean(document.querySelector('[data-surface=\"skill-inspector\"][role=\"dialog\"][aria-modal=\"true\"]')?.textContent.toLowerCase().includes('aihot'))",
  );
  await assertPage(
    "aihot Inspector exposes RECORD OUTCOME",
    "[...document.querySelectorAll('[data-surface=\"skill-inspector\"] button')].some((button) => button.textContent.trim() === 'RECORD OUTCOME')",
  );
  await assertPage(
    "non-verified aihot renders no verified panel and no Inspector panel is empty",
    "!window.__smokeVerifiedDetails.some((record) => record.skill === 'aihot') && !document.querySelector('.inspector-source-details') && ![...document.querySelectorAll('.drawer-section')].some((section) => !section.textContent.trim())",
  );
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('[data-surface="skill-inspector"] button')]
      .find((button) => button.textContent.trim() === 'RECORD OUTCOME');
    window.__smokeOutcomeTrigger = trigger;
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(250);
  await assertPage(
    "Outcome composer owns the top of the dialog stack",
    "Boolean(document.querySelector('[data-surface=\"outcome-composer\"][role=\"dialog\"][aria-modal=\"true\"]') && document.querySelector('[data-surface=\"skill-inspector\"]')?.inert && document.querySelector('[data-surface=\"skill-inspector\"]')?.getAttribute('aria-hidden') === 'true' && !document.querySelector('[data-surface=\"skill-inspector\"]')?.hasAttribute('aria-modal'))",
  );
  await assertPage(
    "Outcome composer focuses its required title",
    "document.activeElement === document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"title\"]')",
  );
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] .outcome-composer-close')?.focus(); true");
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", modifiers: 8, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", modifiers: 8, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await assertPage(
    "Outcome composer traps reverse tab at its last control",
    "document.activeElement === document.querySelector('[data-surface=\"outcome-composer\"] button[type=\"submit\"]')",
  );
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await assertPage(
    "Outcome composer traps forward tab at its first control",
    "document.activeElement === document.querySelector('[data-surface=\"outcome-composer\"] .outcome-composer-close')",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "composer Escape restores RECORD OUTCOME without closing Inspector",
    "!document.querySelector('[data-surface=\"outcome-composer\"]') && Boolean(document.querySelector('[data-surface=\"skill-inspector\"][aria-modal=\"true\"]')) && document.activeElement === window.__smokeOutcomeTrigger",
  );
  await evaluate("window.__smokeOutcomeTrigger?.click(); true");
  await wait(200);
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"title\"]')?.focus(); true");
  await cdp("Input.insertText", { text: "Weekly AI signal brief" });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] textarea[name=\"note\"]')?.focus(); true");
  await cdp("Input.insertText", { text: "Three signals shared with the team." });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"artifactRef\"]')?.focus(); true");
  await cdp("Input.insertText", { text: "local://aihot/week-28" });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] form')?.requestSubmit(); true");
  await wait(300);
  await assertPage(
    "saved outcome appears as latest in Inspector",
    "Boolean(document.querySelector('.inspector-latest-outcome')?.textContent.includes('Weekly AI signal brief') && document.querySelector('.inspector-latest-outcome')?.textContent.includes('Three signals shared with the team.') && document.querySelector('.inspector-latest-outcome')?.textContent.includes('local://aihot/week-28'))",
  );
  await evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1'));
    window.__smokeFirstOutcome = data.outcomes.find((outcome) => outcome.skillId === 'aihot');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return Boolean(window.__smokeFirstOutcome);
  })()`);
  await wait(250);
  await assertPage(
    "closing aihot Inspector restores its ranked trigger",
    "!document.querySelector('[role=\"dialog\"]') && document.activeElement === window.__smokeAihotTrigger",
  );
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'HISTORY')?.click(); true");
  await wait(250);
  await evaluate("document.querySelector('.history-transfer')?.setAttribute('open', ''); true");
  await evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1'));
    window.__smokeOlderOutcome = {
      id: 'skill-installer:2020-01-01T00:00:00.000Z',
      skillId: 'skill-installer',
      title: 'Archived installer outcome',
      completedAt: '2020-01-01T00:00:00.000Z',
      catalogRevision: 'smoke-rev',
    };
    data.outcomes.push(window.__smokeOlderOutcome);
    const input = document.querySelector('.personal-data-transfer');
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setValue.call(input, JSON.stringify(data));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await evaluate("document.querySelector('.outcome-import')?.click(); true");
  await wait(200);
  await assertPage(
    "History renders two concrete outcomes newest first",
    `(() => {
      const items = [...document.querySelectorAll('.outcome-history-item')];
      return items.length === 2
        && items[0].getAttribute('data-outcome-id') === window.__smokeFirstOutcome.id
        && items[0].textContent.includes('Weekly AI signal brief')
        && items[1].getAttribute('data-outcome-id') === window.__smokeOlderOutcome.id
        && items[1].textContent.includes('Archived installer outcome')
        && Date.parse(items[0].getAttribute('data-completed-at')) > Date.parse(items[1].getAttribute('data-completed-at'));
    })()`,
  );
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'LIBRARIAN')?.click(); true");
  await wait(250);
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.ranked-skill-card')]
      .find((card) => card.textContent.toLowerCase().includes('aihot'));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(250);
  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('[data-surface="skill-inspector"] button')]
      .find((button) => button.textContent.trim() === 'RECORD OUTCOME');
    window.__smokeOutcomeTrigger = trigger;
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(250);
  await assertPage(
    "current-period composer prefills the original outcome",
    "document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"title\"]')?.value === 'Weekly AI signal brief' && document.querySelector('[data-surface=\"outcome-composer\"] textarea[name=\"note\"]')?.value === 'Three signals shared with the team.' && document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"artifactRef\"]')?.value === 'local://aihot/week-28'",
  );
  await evaluate("(() => { const field = document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"title\"]'); field?.focus(); field?.select(); return true; })()");
  await cdp("Input.insertText", { text: "Weekly AI signal brief — revised" });
  await evaluate("(() => { const field = document.querySelector('[data-surface=\"outcome-composer\"] textarea[name=\"note\"]'); field?.focus(); field?.select(); return true; })()");
  await cdp("Input.insertText", { text: "Four signals shared with the team." });
  await evaluate("(() => { const field = document.querySelector('[data-surface=\"outcome-composer\"] input[name=\"artifactRef\"]'); field?.focus(); field?.select(); return true; })()");
  await cdp("Input.insertText", { text: "local://aihot/week-28-revised" });
  await evaluate("document.querySelector('[data-surface=\"outcome-composer\"] form')?.requestSubmit(); true");
  await wait(300);
  await assertPage(
    "same-period save updates one record without sliding its identity or completedAt",
    `(() => {
      const current = JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1')).outcomes;
      const outcome = current.find((item) => item.skillId === 'aihot');
      return current.length === 2
        && outcome?.id === window.__smokeFirstOutcome.id
        && outcome?.completedAt === window.__smokeFirstOutcome.completedAt
        && outcome?.title === 'Weekly AI signal brief — revised'
        && outcome?.note === 'Four signals shared with the team.'
        && outcome?.artifactRef === 'local://aihot/week-28-revised';
    })()`,
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'HISTORY')?.click(); true");
  await wait(250);
  await evaluate("document.querySelector('.history-transfer')?.setAttribute('open', ''); true");
  await evaluate("document.querySelector('.outcome-export')?.click(); true");
  await wait(150);
  await assertPage(
    "export fills verifiable personal JSON",
    `(() => {
      const raw = document.querySelector('.personal-data-transfer')?.value ?? '';
      try {
        const exported = JSON.parse(raw);
        window.__smokeValidExport = raw;
        return exported.schemaVersion === 1
          && exported.outcomes.length === 2
          && exported.outcomes.some((outcome) => outcome.title === 'Weekly AI signal brief — revised')
          && exported.outcomes.some((outcome) => outcome.id === window.__smokeOlderOutcome.id);
      } catch {
        return false;
      }
    })()`,
  );
  await evaluate(`(() => {
    window.__smokeBeforeInvalidImport = localStorage.getItem('personal-agent-os.personal-data.v1');
    const input = document.querySelector('.personal-data-transfer');
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setValue.call(input, '{"schemaVersion":2}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await evaluate("document.querySelector('.outcome-import')?.click(); true");
  await wait(200);
  await assertPage(
    "invalid import reports an error without replacing current data",
    "Boolean(document.querySelector('.history-import-error[role=\"alert\"]')) && localStorage.getItem('personal-agent-os.personal-data.v1') === window.__smokeBeforeInvalidImport && document.querySelectorAll('.outcome-history-item').length === 2",
  );
  await evaluate(`(() => {
    const item = document.querySelector('[data-outcome-id="skill-installer:2020-01-01T00:00:00.000Z"]');
    item?.querySelector('.outcome-delete')?.click();
    return Boolean(item);
  })()`);
  await wait(150);
  await assertPage(
    "delete requires an inline keyboard-accessible confirmation before mutation",
    `(() => {
      const item = document.querySelector('[data-outcome-id="skill-installer:2020-01-01T00:00:00.000Z"]');
      const actions = item?.querySelector('.outcome-delete-confirm[role="group"]');
      return Boolean(actions
        && actions.querySelector('.outcome-delete-cancel')
        && actions.querySelector('.outcome-delete-confirm-button')
        && JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1')).outcomes.length === 2);
    })()`,
  );
  await evaluate("document.querySelector('[data-outcome-id=\"skill-installer:2020-01-01T00:00:00.000Z\"] .outcome-delete-confirm-button')?.click(); true");
  await wait(200);
  await assertPage(
    "confirmed delete mutates live data before restore",
    "JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1')).outcomes.length === 1 && !document.querySelector('[data-outcome-id=\"skill-installer:2020-01-01T00:00:00.000Z\"]')",
  );
  await evaluate(`(() => {
    const input = document.querySelector('.personal-data-transfer');
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setValue.call(input, window.__smokeValidExport);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await evaluate("document.querySelector('.outcome-import')?.click(); true");
  await wait(200);
  await assertPage(
    "valid exported data restores the mutated live outcome set",
    `(() => {
      const data = JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1'));
      const items = [...document.querySelectorAll('.outcome-history-item')];
      return !document.querySelector('.history-import-error')
        && data.outcomes.length === 2
        && data.outcomes.some((outcome) => outcome.id === window.__smokeOlderOutcome.id && outcome.title === 'Archived installer outcome')
        && data.outcomes.some((outcome) => outcome.id === window.__smokeFirstOutcome.id && outcome.title === 'Weekly AI signal brief — revised')
        && items[0]?.getAttribute('data-outcome-id') === window.__smokeFirstOutcome.id
        && items[1]?.getAttribute('data-outcome-id') === window.__smokeOlderOutcome.id;
    })()`,
  );
  await evaluate(`(() => {
    const item = document.querySelector(${JSON.stringify('[data-outcome-id]')});
    const target = [...document.querySelectorAll('.outcome-history-item')]
      .find((outcome) => outcome.textContent.includes('Weekly AI signal brief — revised'));
    target?.querySelector('.outcome-delete')?.click();
    return Boolean(item && target);
  })()`);
  await wait(150);
  await assertPage(
    "final manual delete also waits for confirmation",
    "Boolean([...document.querySelectorAll('.outcome-history-item')].find((item) => item.textContent.includes('Weekly AI signal brief — revised'))?.querySelector('.outcome-delete-confirm-button')) && JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1')).outcomes.length === 2",
  );
  await evaluate("[...document.querySelectorAll('.outcome-history-item')].find((item) => item.textContent.includes('Weekly AI signal brief — revised'))?.querySelector('.outcome-delete-confirm-button')?.click(); true");
  await wait(200);
  await assertPage(
    "manual delete removes the personal outcome",
    "document.querySelectorAll('.outcome-history-item').length === 1 && JSON.parse(localStorage.getItem('personal-agent-os.personal-data.v1')).outcomes.length === 1 && ![...document.querySelectorAll('.outcome-history-item')].some((item) => item.textContent.includes('Weekly AI signal brief — revised'))",
  );
  await evaluate("[...document.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'LIBRARIAN')?.click(); true");
  await wait(250);
  await assertPage("submitted search has no Overview or ENTER ORBIT action", "Boolean(document.querySelector('.librarian-page.is-searching')) && !document.querySelector('.portal-entry-trigger,.silent-orbit-page')");
  await evaluate("(() => { const input = document.querySelector('.librarian-search input'); input?.focus(); input?.select(); return true; })()");
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await wait(150);
  await assertPage("submitted query can be erased from the draft", "document.querySelector('.librarian-search input')?.value === '' && Boolean(document.querySelector('.librarian-page.is-searching'))");
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(500);
  await assertPage("empty resubmit clears submitted results", "Boolean(document.querySelector('.librarian-page.is-idle')) && document.querySelectorAll('.ranked-skill-card').length === 0 && document.querySelector('.librarian-status')?.textContent === '' && document.querySelector('.librarian-galaxy-portal')?.getBoundingClientRect().height >= 500");
  await assertPage("empty resubmit keeps Overview removed", "!document.querySelector('.portal-entry-trigger,.silent-orbit-page')");
  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click()");
  await wait(300);
  await evaluate("[...document.querySelectorAll('.catalog-category-card')].find((el) => el.textContent.includes('工程质量与安全'))?.click()");
  await wait(400);
  await assertPage(
    "single-skill category keeps standalone skill unit",
    "document.body.innerText.includes('工程质量与安全') && document.body.innerText.includes('security-best-practices')",
  );
  await evaluate("document.querySelector('.console-brand')?.click()");
  await wait(400);
  await evaluate("document.querySelector('.librarian-clear')?.click()");
  await wait(200);

  if (shouldRunOrbitReviewCase("origin")) {
    await assertPage(
      "removed Overview has no top navigation origin",
      "![...document.querySelectorAll('.nav-button')].some((button) => button.textContent.trim() === 'SILENT ORBIT') && !document.querySelector('.portal-entry-trigger')",
    );
  }

  if (shouldRunOrbitReviewCase("transition")) {
    await evaluate(`(() => {
      const state = { ...(history.state ?? {}) };
      delete state.agentOsSurface;
      history.replaceState({ ...state, __smokeSentinel: 'transition-console' }, '');

      const descriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (descriptor) Object.defineProperty(document, 'startViewTransition', descriptor);
        else delete document.startViewTransition;
      };

      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        writable: true,
        value(update) {
          try {
            const result = update();
            window.__smokeOrbitCommittedInTransition = Boolean(document.querySelector('.silent-orbit-page'));
            const done = Promise.resolve(result);
            return { finished: done, ready: done, updateCallbackDone: done, skipTransition() {} };
          } finally {
            restore();
          }
        },
      });

      const portal = document.querySelector('.portal-system-hit[data-system-id]');
      try {
        portal?.click();
        return Boolean(portal);
      } finally {
        restore();
      }
    })()`);
    await wait(100);
    await assertPage(
      "view transition commits orbit inside update callback",
      "window.__smokeOrbitCommittedInTransition === true && Boolean(document.querySelector('.silent-orbit-page'))",
    );
    await evaluate("document.querySelector('.orbit-close')?.click(); true");
    await waitForPage(
      "transition case returns to its console sentinel",
      "history.state?.__smokeSentinel === 'transition-console' && Boolean(document.querySelector('.agent-console'))",
      5000,
    );
  }

  if (shouldRunOrbitReviewCase("reload")) {
    await evaluate(`(() => {
      const state = { ...(history.state ?? {}) };
      delete state.agentOsSurface;
      history.replaceState({ ...state, __smokeSentinel: 'reload-console' }, '');
      history.pushState({ ...state, __smokeSentinel: 'reload-orbit', agentOsSurface: 'orbit' }, '');
      return true;
    })()`);
    await cdp("Page.reload", { ignoreCache: true });
    await wait(1200);
    await assertPage(
      "reload initializes from current orbit marker",
      "history.state?.agentOsSurface === 'orbit' && history.state?.__smokeSentinel === 'reload-orbit' && Boolean(document.querySelector('.silent-orbit-page[data-view-mode=\"category\"]')) && !document.querySelector('.orbit-mobile-context-nav[data-orbit-mobile-mode=\"overview\"]') && document.querySelector('.silent-orbit-page')?.contains(document.activeElement)",
    );
    await evaluate("document.querySelector('.orbit-close')?.click(); true");
    await waitForPage(
      "reload orbit closes back to console sentinel once",
      "history.state?.__smokeSentinel === 'reload-console' && history.state?.agentOsSurface !== 'orbit' && Boolean(document.querySelector('.agent-console'))",
      5000,
    );
  }

  if (shouldRunOrbitReviewCase("reentrancy")) {
    await evaluate(`(() => {
      const state = { ...(history.state ?? {}) };
      delete state.agentOsSurface;
      history.replaceState({ ...state, __smokeSentinel: 'rapid-open-console' }, '');

      const mediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
      const pushDescriptor = Object.getOwnPropertyDescriptor(history, 'pushState');
      const originalPush = history.pushState.bind(history);
      const restore = () => {
        if (mediaDescriptor) Object.defineProperty(window, 'matchMedia', mediaDescriptor);
        else delete window.matchMedia;
        if (pushDescriptor) Object.defineProperty(history, 'pushState', pushDescriptor);
        else delete history.pushState;
      };

      window.__smokeOrbitPushes = 0;
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: () => ({ matches: true }),
      });
      Object.defineProperty(history, 'pushState', {
        configurable: true,
        writable: true,
        value(nextState, title, url) {
          if (nextState?.agentOsSurface === 'orbit') window.__smokeOrbitPushes += 1;
          return originalPush(nextState, title, url);
        },
      });

      const portal = document.querySelector('.portal-system-hit[data-system-id]');
      try {
        portal?.click();
        portal?.click();
        return Boolean(portal);
      } finally {
        restore();
      }
    })()`);
    await wait(100);
    await assertPage(
      "rapid double open pushes one orbit entry",
      "window.__smokeOrbitPushes === 1 && history.state?.agentOsSurface === 'orbit' && Boolean(document.querySelector('.silent-orbit-page'))",
    );
    await evaluate("document.querySelector('.orbit-close')?.click(); true");
    await waitForPage(
      "one close after rapid open returns to sentinel",
      "history.state?.__smokeSentinel === 'rapid-open-console' && Boolean(document.querySelector('.agent-console'))",
      5000,
    );

    await evaluate(`(() => {
      const state = { ...(history.state ?? {}) };
      delete state.agentOsSurface;
      history.replaceState({ ...state, __smokeSentinel: 'escape-console' }, '');
      document.querySelector('.portal-system-hit[data-system-id]')?.click();
      return true;
    })()`);
    await wait(750);
    await evaluate(`(() => {
      const descriptor = Object.getOwnPropertyDescriptor(history, 'back');
      const originalBack = history.back.bind(history);
      const restore = () => {
        if (descriptor) Object.defineProperty(history, 'back', descriptor);
        else delete history.back;
      };
      window.__smokeEscapeBackCalls = 0;
      Object.defineProperty(history, 'back', {
        configurable: true,
        writable: true,
        value() {
          window.__smokeEscapeBackCalls += 1;
          if (window.__smokeEscapeBackCalls === 1) originalBack();
        },
      });
      const orbit = document.querySelector('.silent-orbit-page');
      try {
        orbit?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        orbit?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return Boolean(orbit);
      } finally {
        restore();
      }
    })()`);
    await waitForPage(
      "repeated escape traverses history once",
      "window.__smokeEscapeBackCalls === 1 && history.state?.__smokeSentinel === 'escape-console' && Boolean(document.querySelector('.agent-console'))",
      5000,
    );

    await evaluate(`(() => {
      const state = { ...(history.state ?? {}) };
      delete state.agentOsSurface;
      history.replaceState({ ...state, __smokeSentinel: 'close-console' }, '');
      document.querySelector('.portal-system-hit[data-system-id]')?.click();
      return true;
    })()`);
    await wait(750);
    await evaluate(`(() => {
      const descriptor = Object.getOwnPropertyDescriptor(history, 'back');
      const originalBack = history.back.bind(history);
      const restore = () => {
        if (descriptor) Object.defineProperty(history, 'back', descriptor);
        else delete history.back;
      };
      window.__smokeCloseBackCalls = 0;
      Object.defineProperty(history, 'back', {
        configurable: true,
        writable: true,
        value() {
          window.__smokeCloseBackCalls += 1;
          if (window.__smokeCloseBackCalls === 1) originalBack();
        },
      });
      const close = document.querySelector('.orbit-close');
      try {
        close?.click();
        close?.click();
        return Boolean(close);
      } finally {
        restore();
      }
    })()`);
    await waitForPage(
      "repeated close traverses history once",
      "window.__smokeCloseBackCalls === 1 && history.state?.__smokeSentinel === 'close-console' && Boolean(document.querySelector('.agent-console'))",
      5000,
    );
  }

  await evaluate(`(() => {
    const portal = document.querySelector('.portal-system-hit[data-system-id]');
    window.__smokeOpenedPortal = portal;
    window.__smokeOpenedPortalReturnId = portal?.getAttribute('data-orbit-return-id');
    portal?.focus();
    portal?.click();
    return Boolean(portal);
  })()`);
  await wait(750);
  await assertPage("orbit page opens", "Boolean(document.querySelector('.silent-orbit-page[data-surface=\"orbit\"]'))");
  await waitForPage(
    "focus enters orbit",
    "document.querySelector('.silent-orbit-page')?.contains(document.activeElement)",
  );
  await assertPage("orbit history marker is set", "history.state?.agentOsSurface === 'orbit'");
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await waitForPage(
    "escape restores the current portal",
    "!document.querySelector('.silent-orbit-page') && document.activeElement === document.querySelector(`[data-orbit-return-id=\"${window.__smokeOpenedPortalReturnId}\"]`) && document.activeElement !== window.__smokeOpenedPortal",
    5000,
  );
  await assertPage("escape clears orbit history", "history.state?.agentOsSurface !== 'orbit'");

  await evaluate("document.querySelector('.portal-system-hit[data-system-id]')?.click(); true");
  await wait(750);
  await assertPage("reopened orbit sets history marker", "history.state?.agentOsSurface === 'orbit'");
  await evaluate("history.back(); true");
  await waitForPage(
    "browser back restores portal focus",
    "!document.querySelector('.silent-orbit-page') && document.activeElement === document.querySelector(`[data-orbit-return-id=\"${window.__smokeOpenedPortalReturnId}\"]`)",
    5000,
  );
  await assertPage("browser back clears orbit history", "history.state?.agentOsSurface !== 'orbit'");

  await evaluate("document.querySelector('.portal-system-hit[data-system-id]')?.click(); true");
  await wait(750);
  await assertPage(
    "direct System entry opens Category without an Overview step",
    "document.querySelector('.silent-orbit-page[data-view-mode=\"category\"]') && document.querySelectorAll('.celestial-system').length === 9 && document.querySelectorAll('.library-moon').length > 0 && document.querySelectorAll('.skill-asteroid').length === 0",
  );
  await evaluate("document.querySelector('.silent-orbit-page')?.focus(); window.__orbitZoom = document.querySelector('.orbit-controls output')?.textContent; document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "keyboard zoom updates orbit",
    "document.querySelector('.orbit-controls output')?.textContent !== window.__orbitZoom",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "category reveals libraries only",
    "document.querySelector('.silent-orbit-page[data-view-mode=\"category\"]') && document.querySelectorAll('.library-moon').length > 0 && document.querySelectorAll('.skill-asteroid').length === 0",
  );
  await assertOrbitFocusGeometry(
    "category orbit geometry aligns with its centered system",
    ".celestial-system[aria-pressed=\"true\"]",
    ".orbit-geometry ellipse",
  );
  await evaluate("document.querySelector('.orbit-controls [aria-label=\"Zoom in\"]')?.click(); true");
  await wait(650);
  await assertOrbitFocusGeometry(
    "category system stays centered after zoom",
    ".celestial-system[aria-pressed=\"true\"]",
    ".orbit-geometry ellipse",
  );

  const obsidianMoonFound = await evaluate(
    "[...document.querySelectorAll('.library-moon')].some((item) => item.textContent.includes('obsidian'))",
  );
  if (!obsidianMoonFound) throw new Error("UI smoke failed: obsidian library is reachable from a category system");
  await evaluate(`(() => {
    const node = [...document.querySelectorAll('.library-moon')].find((item) => item.textContent.includes('obsidian'));
    window.__stationId = node?.getAttribute('data-station-id');
    node?.click();
    return Boolean(node);
  })()`);
  await wait(650);
  await assertPage(
    "library reveals its asteroids",
    "document.querySelector('.silent-orbit-page[data-view-mode=\"library\"]') && document.querySelector('.library-moon[aria-pressed=\"true\"]')?.getAttribute('data-station-id') === window.__stationId && document.querySelectorAll('.skill-asteroid').length > 0 && [...document.querySelectorAll('.skill-asteroid')].every((node) => node.getAttribute('data-station-id') === window.__stationId)",
  );
  await assertPage(
    "selected library keeps its stable catalog station ID",
    "window.__stationId === 'station:library:local:obsidian'",
  );
  await assertPage(
    "parent system identity yields to the selected library at library depth",
    "Number(getComputedStyle(document.querySelector('.celestial-system[data-active=\"true\"] .system-copy')).opacity) === 0",
  );
  await assertPage(
    "selected library identity corridor stays clear of skill controls and hover labels",
    `(() => {
      const copy = document.querySelector('.library-moon[aria-pressed="true"] .moon-copy')?.getBoundingClientRect();
      if (!copy) return false;
      const candidates = [...document.querySelectorAll('.skill-asteroid,.skill-asteroid .asteroid-label')];
      return candidates.length > 0 && candidates.every((node) => {
        const box = node.getBoundingClientRect();
        const horizontal = Math.max(0, Math.min(copy.right, box.right) - Math.max(copy.left, box.left));
        const vertical = Math.max(0, Math.min(copy.bottom, box.bottom) - Math.max(copy.top, box.top));
        return horizontal * vertical === 0;
      });
    })()`,
  );
  await assertOrbitFocusGeometry(
    "selected library is centered at library depth",
    ".library-moon[aria-pressed=\"true\"]",
  );
  await evaluate(`(() => {
    const trigger = document.querySelector('.skill-asteroid');
    window.__smokeOrbitSkillTrigger = trigger;
    window.__smokeOrbitSkillId = trigger?.getAttribute('data-skill-id');
    window.__smokeOrbitSkillStationId = trigger?.getAttribute('data-station-id');
    window.__smokeOrbitSkillLabel = trigger?.getAttribute('aria-label');
    trigger?.focus();
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(250);
  await assertPage(
    "orbit skill opens Inspector with stable skill and station IDs",
    "Boolean(/^skill:[^:]+$/.test(window.__smokeOrbitSkillId) && window.__smokeOrbitSkillStationId === window.__stationId && document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')?.textContent.includes(window.__smokeOrbitSkillLabel))",
  );
  await assertPage(
    "orbit Skill Detail restores the lower-left Silent Horizon title",
    `(() => {
      const caption = document.querySelector('.silent-horizon-caption[data-arrival-context="orbit"]');
      const box = caption?.getBoundingClientRect();
      const drawerBox = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
      const style = caption ? getComputedStyle(caption) : null;
      return Boolean(caption && box && drawerBox && caption.textContent.includes('SILENT HORIZON / SKILL SIGNAL'))
        && style.display !== 'none'
        && Number(style.opacity) >= .8
        && box.left < drawerBox.left
        && box.right <= drawerBox.left;
    })()`,
  );
  await assertPage(
    "orbit inspector isolates background content",
    "Boolean(document.querySelector('.app-content')?.inert && document.querySelector('.app-content')?.getAttribute('aria-hidden') === 'true')",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "Inspector Escape preserves Orbit, IDs, and trigger focus",
    "!document.querySelector('[role=\"dialog\"]') && Boolean(document.querySelector('.silent-orbit-page[data-surface=\"orbit\"]')) && history.state?.agentOsSurface === 'orbit' && document.activeElement === window.__smokeOrbitSkillTrigger && window.__smokeOrbitSkillTrigger?.getAttribute('data-skill-id') === window.__smokeOrbitSkillId && window.__smokeOrbitSkillTrigger?.getAttribute('data-station-id') === window.__stationId",
  );
  await evaluate("document.querySelector('.orbit-close')?.click(); true");
  await waitForPage(
    "orbit close returns to console and restores portal focus",
    "Boolean(document.querySelector('.agent-console[data-surface=\"console\"]')) && document.activeElement === document.querySelector(`[data-orbit-return-id=\"${window.__smokeOpenedPortalReturnId}\"]`)",
    5000,
  );
  await assertPage("orbit close clears history marker", "history.state?.agentOsSurface !== 'orbit'");

  await evaluate("document.querySelector('.librarian-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "obsidian" });
  await wait(350);
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(250);
  await assertPage("desktop search results do not expose the removed Overview entry", "document.querySelectorAll('.ranked-skill-card').length > 0 && !document.querySelector('.portal-entry-trigger,.silent-orbit-page')");
  await evaluate("(() => { document.querySelector('.librarian-clear')?.click(); const input = document.querySelector('.librarian-search input'); input?.focus(); return true; })()");
  await cdp("Input.insertText", { text: "no-such-orbit-signal-7f34" });
  await wait(350);
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(250);
  await assertPage("empty search stays in Librarian without the removed Overview entry", "document.querySelectorAll('.ranked-skill-card').length === 0 && !document.querySelector('.portal-entry-trigger,.silent-orbit-page')");
  await evaluate("document.querySelector('.librarian-clear')?.click(); true");
  await wait(200);

  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(300);
  await evaluate("document.querySelector('.catalog-category-card[data-category-id]')?.click()");
  await wait(500);
  await assertPage("category navigation opens browser category", "document.body.innerText.includes('个人知识库与本地工具')");
  await assertPage(
    "other Skills use a dedicated direct-entry card grid",
    `(() => {
      const section = document.querySelector('.standalone-skill-section');
      const grid = section?.querySelector('.standalone-skill-grid');
      const cards = [...(grid?.querySelectorAll('.standalone-skill-card') ?? [])];
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      return Boolean(section && grid && cards.length > 0)
        && section.textContent.includes('本分类的其他 Skills')
        && !section.textContent.includes('未归入')
        && columns >= 2
        && cards.every((card) => card.querySelector('.unit-kind')?.textContent.includes('直接进入'));
    })()`,
  );
  await evaluate(`(() => {
    const trigger = document.querySelector('.standalone-skill-card');
    window.__smokeStandaloneTrigger = trigger;
    trigger?.focus();
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(300);
  await assertPage(
    "standalone Skill card opens Inspector directly",
    "Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]') && document.querySelector('.silent-horizon-caption[data-arrival-context=\"catalog\"]'))",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "standalone Skill close restores its card focus",
    "!document.querySelector('[role=\"dialog\"]') && document.activeElement === window.__smokeStandaloneTrigger",
  );
  await assertPage(
    "category filter controls expose stable accessible state",
    "Boolean(document.querySelector('.command-search input[aria-label]') && document.querySelector('.toggle-button[aria-pressed=\"false\"]') && document.querySelector('.filter-meta[aria-live=\"polite\"]'))",
  );
  await assertPage(
    "category result count matches its available Skill heading",
    "(() => { const meta = document.querySelector('.filter-meta')?.textContent.match(/(\\d+) 个 Skills/); const header = document.querySelector('[data-page=\"category\"] .page-header p')?.textContent.match(/(\\d+) 个可查看 Skills/); return Boolean(meta && header && meta[1] === header[1]); })()",
  );
  await evaluate("document.querySelector('.command-search input').focus()");
  await cdp("Input.insertText", { text: "obsidian" });
  await wait(400);
  await assertPage(
    "command search accepts Skill and library names with consistent results",
    "document.querySelector('.command-search input')?.value === 'obsidian' && document.querySelectorAll('.unit-card').length === 1 && /当前匹配 \\d+ 个 Skills/.test(document.querySelector('.filter-meta')?.textContent ?? '')",
  );

  await evaluate("[...document.querySelectorAll('.unit-card-main')].find((el) => el.textContent.includes('obsidian'))?.click()");
  await wait(500);
  await assertPage("obsidian unit expands", "document.body.innerText.includes('$obsidian')");
  await assertPage("obsidian remains discoverable", "document.body.innerText.toLowerCase().includes('obsidian')");

  await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.skill-row')].find((el) => el.textContent.includes('obsidian-vault') || el.textContent.includes('obsidian'));
    window.__smokeSkillTrigger = trigger;
    trigger?.focus();
    trigger?.click();
    return Boolean(trigger);
  })()`);
  await wait(500);
    await assertPage("skill drawer opens", "document.body.innerText.includes('SKILL DETAIL') && document.body.innerText.includes('何时触发')");
    await assertPage(
      "Catalog Skill arrival preserves its Silent Horizon title",
      `(() => {
        const caption = document.querySelector('.silent-horizon-caption');
        const skillName = caption?.querySelector('strong')?.textContent.trim();
        const style = caption ? getComputedStyle(caption) : null;
        return Boolean(caption && caption.dataset.arrivalContext === 'catalog' && skillName && style?.display !== 'none' && Number(style.opacity) >= .8);
      })()`,
    );
    await assertPage(
      "Catalog atlas recedes behind the Silent Horizon Inspector",
      `(() => {
        const workspace = document.querySelector('.agent-console [data-page="category"]')?.closest('.console-workspace');
        const style = workspace ? getComputedStyle(workspace) : null;
        return Boolean(style && style.transform !== 'none' && Number(style.opacity) <= .2);
      })()`,
    );
    await assertPage(
      "Catalog Skill arrival renders one stable production environment on the left",
      `(() => {
        const environment = document.querySelector('.silent-horizon-environment');
        const drawer = document.querySelector('[role="dialog"]');
        const environmentBox = environment?.getBoundingClientRect();
        const drawerBox = drawer?.getBoundingClientRect();
        const pathname = environment?.currentSrc ? new URL(environment.currentSrc).pathname : '';
        const allowed = new Set([
          '/assets/cosmos/environments/lost-relay-v01.png',
          '/assets/cosmos/environments/01-dead-corona-terminal-v01.png',
          '/assets/cosmos/environments/03-orphan-moon-tide-v01.png',
          '/assets/cosmos/environments/04-spent-comet-archive-v01.png',
          '/assets/cosmos/environments/05-abandoned-listening-array-v01.png',
          '/assets/cosmos/environments/06-severed-orbital-elevator-v01.png',
          '/assets/cosmos/environments/07-buried-archive-vault-v01.png',
          '/assets/cosmos/environments/08-drift-lighthouse-v01.png',
          '/assets/cosmos/environments/10-failed-beacon-procession-v01.png',
          '/assets/cosmos/environments/11-gravity-lens-ghost-v01.png',
          '/assets/cosmos/environments/15-far-side-signal-garden-v01.png',
          '/assets/cosmos/environments/16-sleeping-ring-station-v01.png',
        ]);
        return Boolean(environment && drawer && environmentBox && drawerBox)
          && getComputedStyle(environment).display === 'block'
          && Number(getComputedStyle(environment).opacity) >= .8
          && environment.complete
          && environment.naturalWidth > 0
          && allowed.has(pathname)
          && environmentBox.left === 0
          && Math.abs(environmentBox.right - drawerBox.left) <= 1;
      })()`,
    );
    await assertPage(
      "skill inspector exposes modal dialog semantics",
    "Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]'))",
  );
  await assertPage(
    "skill inspector exposes its semantic surface hook",
    "Boolean(document.querySelector('[data-surface=\"skill-inspector\"][role=\"dialog\"][aria-modal=\"true\"][aria-labelledby][aria-describedby]'))",
  );
  await assertPage(
    "skill inspector receives focus",
    "document.querySelector('[role=\"dialog\"]')?.contains(document.activeElement)",
  );
  await assertPage(
    "skill inspector isolates background content",
    "Boolean(document.querySelector('.drawer-backdrop') && document.querySelector('.app-content')?.inert && document.querySelector('.app-content')?.getAttribute('aria-hidden') === 'true' && document.body.style.overflow === 'hidden')",
  );
  await assertOneBitPalette("category and inspector use one-bit palette", [
    ".agent-console .unit-kind",
    "[role=\"dialog\"]",
    "[role=\"dialog\"] .drawer-header",
    "[role=\"dialog\"] .detail-item",
    "[role=\"dialog\"] code",
  ]);
  await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    window.__smokeOriginalInspectorSkill = dialog?.querySelector('h2')?.textContent.trim();
    window.__smokeOriginalArrival = document.querySelector('.silent-horizon-environment')?.getAttribute('data-cosmos-asset');
    if (dialog) dialog.scrollTop = Math.min(500, dialog.scrollHeight - dialog.clientHeight);
    document.querySelector('[data-inspector-sibling="next"]')?.click();
    return true;
  })()`);
  await wait(350);
  await assertPage(
    "Inspector switches to a sibling Skill without closing the arrival surface",
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const title = dialog?.querySelector('h2')?.textContent.trim();
      const environment = document.querySelector('.silent-horizon-environment');
      return Boolean(dialog && title && title !== window.__smokeOriginalInspectorSkill
        && history.state?.agentOsSkill === title
        && dialog.scrollTop === 0
        && environment?.complete
        && environment?.naturalWidth > 0
        && environment.getAttribute('data-arrival-skill') === title);
    })()`,
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "escape closes inspector and restores trigger focus",
    "!document.querySelector('[role=\"dialog\"]') && !document.querySelector('.app-content')?.inert && document.body.style.overflow !== 'hidden' && document.activeElement === window.__smokeSkillTrigger",
  );
  await evaluate("history.back(); true");
  await wait(250);
  await assertPage("browser Back returns Category to Catalog", "Boolean(document.querySelector('[data-page=\"catalog\"]'))");
  await evaluate("history.back(); true");
  await wait(250);
  await assertPage("browser Back returns Catalog to Librarian", "Boolean(document.querySelector('[data-page=\"librarian\"]'))");

  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(250);
  await evaluate("document.querySelector('.catalog-category-card')?.click(); true");
  await wait(250);
  await evaluate(`(() => {
    const select = document.querySelector('.command-filter-row select');
    if (!select) return false;
    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await wait(250);
  await assertPage(
    "selecting all functional zones returns to the unfiltered Catalog",
    "Boolean(document.querySelector('[data-page=\"catalog\"]') && !document.querySelector('.command-deck,.function-rail'))",
  );
  await evaluate("document.querySelector('.catalog-secondary-action[data-catalog-target=\"private\"]')?.click()");
  await wait(400);
  await assertPage("personal deck opens", "document.querySelector('[data-page=\"private\"]') && document.body.innerText.includes('PERSONAL DECK') && document.body.innerText.includes('个人常用') && !document.querySelector('.function-rail')");
  await assertOneBitPalette("personal deck uses one-bit palette", [
    ".agent-console .private-header",
    ".agent-console .private-header p",
    ".agent-console .skill-row",
  ]);

  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(250);
  await evaluate("document.querySelector('.catalog-secondary-action[data-catalog-target=\"sources\"]')?.click()");
  await wait(400);
  await assertPage("sources page opens", "document.querySelector('[data-page=\"sources\"]') && document.body.innerText.includes('SOURCE INDEX') && document.body.innerText.includes('global') && !document.querySelector('.function-rail')");
  await assertPage("html-ppt remains indexed", "document.body.innerText.toLowerCase().includes('html-ppt')");
  await assertOneBitPalette("sources page uses one-bit palette", [
    ".agent-console .source-global",
    ".agent-console .source-global p",
    ".agent-console .source-global .source-facts span",
  ]);

  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(250);
  await evaluate("document.querySelector('.catalog-secondary-action[data-catalog-target=\"changes\"]')?.click()");
  await wait(400);
  await assertPage("changes page opens", "document.querySelector('[data-page=\"changes\"]') && document.body.innerText.includes('CHANGE LOG') && !document.querySelector('.function-rail')");
  await assertOneBitPalette("changes page uses one-bit palette", [
    ".agent-console .timeline-item",
    ".agent-console .timeline-item span",
    ".agent-console .timeline-item p",
  ]);

  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(250);
  await evaluate("document.querySelector('.catalog-secondary-action[data-catalog-target=\"maintenance\"]')?.click()");
  await wait(400);
  await assertPage(
    "maintenance page exposes only the sanitized public snapshot",
    "(async () => { const page = document.querySelector('[data-page=\"maintenance\"]'); const text = page?.innerText ?? ''; const status = await fetch(new URL('data/maintenance-status.json', location.href)).then((response) => response.json()); const metrics = [...(page?.querySelectorAll('.maintenance-metrics strong') ?? [])].map((node) => node.textContent.trim()); return Boolean(page && text.includes('MAINTENANCE LINK') && metrics[0] === String(status.catalogSkills) && metrics[1] === String(status.publicGlobalSkills) && metrics[2] === 'SAFE' && !/hatch-pet|humanizer/i.test(text) && !document.querySelector('.function-rail')); })()",
  );
  await assertPage(
    "maintenance page explains all three update channels",
    "document.querySelectorAll('.maintenance-channel-card').length === 3 && Boolean(document.querySelector('[data-maintenance-channel=\"source-managed-global\"]')) && Boolean(document.querySelector('[data-maintenance-channel=\"plugins\"]')) && Boolean(document.querySelector('[data-maintenance-channel=\"system\"]'))",
  );
  await evaluate(`(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__smokeMaintenanceClipboard = value; } },
    });
    document.querySelector('[data-maintenance-action="copy-handoff"]')?.click();
    return true;
  })()`);
  await wait(150);
  await assertPage(
    "maintenance handoff copies a plan-first local Codex request",
    "window.__smokeMaintenanceClipboard?.includes('$skills-library-maintenance') && window.__smokeMaintenanceClipboard?.includes('先展示计划') && document.querySelector('.maintenance-copy-status')?.textContent.includes('已复制')",
  );
  await assertOneBitPalette("maintenance page uses one-bit palette", [
    ".agent-console .maintenance-summary",
    ".agent-console .maintenance-channel-card",
    ".agent-console .maintenance-handoff",
  ]);
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
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp("Page.navigate", { url: targetUrl });
  await wait(1200);
  await assertChineseFonts("mobile");
  await assertPage(
    "mobile Librarian has no horizontal overflow",
    "document.documentElement.scrollWidth<=innerWidth && Boolean(document.querySelector('.librarian-page.is-idle'))",
  );
  await assertPage(
    "mobile portal stays inside viewport",
    "(()=>{const box=document.querySelector('.silent-orbit-portal')?.getBoundingClientRect();return Boolean(box&&box.left>=0&&box.right<=innerWidth&&box.height>=320)})()",
  );
  await assertPage(
    "mobile direct System entries are large, visible, and locally hittable",
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
  await evaluate("document.querySelector('.portal-system-hit[data-system-id]')?.click();true");
  await wait(700);
  const mobileBrowserSystemSelector = '.celestial-system[aria-pressed="true"]';
  const mobileobsidianStationSelector = '.library-moon[data-station-id="station:library:local:obsidian"]';
  const mobileobsidianClusterSelector = '.skill-asteroid[data-station-id="station:library:local:obsidian"]';
  const mobileobsidianSkillSelector = '.skill-asteroid[data-skill-id="skill:obsidian-vault"][data-station-id="station:library:local:obsidian"]';
  await assertPage(
    "mobile direct entry skips Overview and exposes a Category context",
    `(() => {
      const nav = document.querySelector('.orbit-mobile-context-nav[data-orbit-mobile-mode="category"]');
      return Boolean(document.querySelector('.silent-orbit-page[data-view-mode="category"]'))
        && Boolean(nav)
        && !document.querySelector('.orbit-mobile-context-nav[data-orbit-mobile-mode="overview"]');
    })()`,
  );
  await assertPage(
    "mobile Orbit reduces decorative starfield before identity text",
    `(() => {
      const stars = [...document.querySelectorAll('.orbit-star-field circle')];
      const visible = stars.filter((star) => getComputedStyle(star).display !== 'none' && Number(getComputedStyle(star).opacity) > 0);
      return stars.length > 0 && visible.length > 0 && visible.length <= 8;
    })()`,
  );
  await assertPage(
    "mobile keeps every system button accessible",
    "document.querySelectorAll('.celestial-system').length===9 && [...document.querySelectorAll('.celestial-system')].every((button)=>{const label=button.getAttribute('aria-label')?.toLowerCase()??'';return Boolean(button.querySelector('strong')&&label.includes('skills')&&label.includes('libraries'))})",
  );
  await assertPage(
    "mobile orbit controls stay inside viewport",
    "[...document.querySelectorAll('.orbit-controls button')].every((button)=>{const box=button.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight})",
  );
  await assertPage(
    "orbit marks only its current breadcrumb",
    "document.querySelectorAll('.orbit-controls [aria-current=\"page\"]').length===1 && document.querySelector('.orbit-overview')?.textContent.includes('CATEGORY')",
  );
  await assertPage(
    "mobile category exposes non-empty visible library identities",
    `(() => {
      const active = document.querySelector(${JSON.stringify(mobileBrowserSystemSelector)});
      const nav = document.querySelector('.orbit-mobile-context-nav[data-orbit-mobile-mode="category"]');
      const buttons = [...(nav?.querySelectorAll('button[data-station-id]') ?? [])];
      const visible = buttons.filter((button) => { const box = button.getBoundingClientRect(); return box.right > 0 && box.left < innerWidth; });
      return Boolean(document.querySelector('.silent-orbit-page[data-view-mode="category"]')
        && active?.getAttribute('data-active') === 'true'
        && getComputedStyle(active.querySelector('strong')).opacity === '1'
        && nav
        && nav.querySelector('button[data-station-id="station:library:local:obsidian"]'))
        && buttons.length === document.querySelectorAll('.library-moon').length
        && buttons.length > 0
        && visible.length > 0
        && buttons.every((button) => button.getAttribute('data-station-id')?.startsWith('station:')
          && button.textContent.trim().length > 0
          && button.getBoundingClientRect().height >= 44);
    })()`,
  );
  await activateAtRenderedCenter("mobile obsidian library is reachable at its center", mobileobsidianStationSelector);
  await wait(650);
  await assertPage(
    "mobile library opens its skill depth",
    `Boolean(document.querySelector('.silent-orbit-page[data-view-mode="library"]') && document.querySelector(${JSON.stringify(mobileobsidianStationSelector)})?.getAttribute('aria-pressed') === 'true' && document.querySelector(${JSON.stringify(mobileobsidianSkillSelector)}))`,
  );
  await assertPage(
    "mobile library context nav exposes category and every sibling library",
    `(() => { const nav = document.querySelector('.orbit-mobile-context-nav'); const back = nav?.querySelector('button[data-system-id]'); const libraries = [...(nav?.querySelectorAll('button[data-station-id]') ?? [])]; const worldLibraries = [...document.querySelectorAll('.library-moon')]; const buttons = back ? [back, ...libraries] : []; return Boolean(nav && back && back.getAttribute('data-system-id') === document.querySelector(${JSON.stringify(mobileBrowserSystemSelector)})?.getAttribute('data-system-id')) && libraries.length > 1 && libraries.length === worldLibraries.length && new Set(libraries.map((node) => node.getAttribute('data-station-id'))).size === libraries.length && libraries.filter((node) => node.getAttribute('aria-current') === 'page').length === 1 && libraries.find((node) => node.getAttribute('aria-current') === 'page')?.getAttribute('data-station-id') === document.querySelector(${JSON.stringify(mobileobsidianStationSelector)})?.getAttribute('data-station-id') && buttons.every((node) => { const box = node.getBoundingClientRect(); return box.width >= 44 && box.height >= 44; }); })()`,
  );
  const mobileSiblingStationId = await evaluate("document.querySelector('.orbit-mobile-context-nav button[data-station-id]:not([aria-current=\"page\"])')?.getAttribute('data-station-id') ?? null");
  await evaluate(`document.querySelector('.orbit-mobile-context-nav button[data-station-id=${JSON.stringify(mobileSiblingStationId)}]')?.click(); true`);
  await wait(250);
  await assertPage(
    "mobile library context nav switches a sibling library",
    `document.querySelector('.silent-orbit-page')?.getAttribute('data-view-mode') === 'library' && document.querySelector('.orbit-mobile-context-nav button[aria-current="page"]')?.getAttribute('data-station-id') === ${JSON.stringify(mobileSiblingStationId)} && document.querySelector('.library-moon[aria-pressed="true"]')?.getAttribute('data-station-id') === ${JSON.stringify(mobileSiblingStationId)}`,
  );
  await evaluate("document.querySelector('.orbit-mobile-context-nav button[data-system-id]')?.click(); true");
  await wait(250);
  await assertPage(
    "mobile library context nav returns to its category",
    `document.querySelector('.silent-orbit-page')?.getAttribute('data-view-mode') === 'category' && document.querySelector(${JSON.stringify(mobileBrowserSystemSelector)})?.getAttribute('data-active') === 'true'`,
  );
  await activateAtRenderedCenter("mobile obsidian library remains reachable after context navigation", mobileobsidianStationSelector);
  await wait(650);
  await assertPage(
    "mobile library gives visual priority to the selected library",
    `(() => { const system = document.querySelector(${JSON.stringify(mobileBrowserSystemSelector)}); const moon = document.querySelector(${JSON.stringify(mobileobsidianStationSelector)}); const systemBox = system?.getBoundingClientRect(); return Boolean(system && moon && systemBox && systemBox.width <= 36 && systemBox.height <= 36 && getComputedStyle(system.querySelector('strong')).display === 'none' && getComputedStyle(moon.querySelector('strong')).display !== 'none'); })()`,
  );
  await assertPage(
    "mobile library obsidian skill centers are unique",
    `(() => { const nodes = [...document.querySelectorAll(${JSON.stringify(mobileobsidianClusterSelector)})]; const centers = nodes.map((node) => { const box = node.getBoundingClientRect(); return [Math.round((box.left + box.width / 2) * 10), Math.round((box.top + box.height / 2) * 10)].join(':'); }); return nodes.length === 4 && new Set(centers).size === nodes.length; })()`,
  );
  await activateAtRenderedCenter("mobile obsidian skill is reachable at its center", mobileobsidianSkillSelector);
  await wait(250);
  await assertPage(
    "mobile Orbit skill opens Inspector",
    "Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]') && document.querySelector('.silent-orbit-page[data-view-mode=\"library\"]') && history.state?.agentOsSurface === 'orbit')",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(250);
  await assertPage(
    "mobile Inspector close preserves library Orbit",
    "!document.querySelector('[role=\"dialog\"]') && Boolean(document.querySelector('.silent-orbit-page[data-view-mode=\"library\"]')) && history.state?.agentOsSurface === 'orbit'",
  );
  await activateAtRenderedCenter("mobile depth flow can close Orbit", ".orbit-close");
  await wait(700);
  await assertPage(
    "mobile depth flow restores console state",
    "Boolean(document.querySelector('.agent-console[data-surface=\"console\"]')) && history.state?.agentOsSurface!=='orbit'",
  );
  await evaluate("(() => { const input = document.querySelector('.librarian-search input'); input?.focus(); return true; })()");
  await cdp("Input.insertText", { text: "obsidian" });
  await wait(350);
  await assertPage("mobile accepts real obsidian draft", "document.querySelector('.librarian-search input')?.value === 'obsidian' && document.querySelectorAll('.ranked-skill-card').length === 0");
  await evaluate("document.querySelector('.librarian-search')?.requestSubmit(); true");
  await wait(250);
  await assertPage(
    "mobile submitted search does not expose the removed Overview entry",
    "document.querySelectorAll('.ranked-skill-card').length > 0 && !document.querySelector('.portal-entry-trigger,.silent-orbit-page')",
  );
  await evaluate("document.querySelector('.librarian-clear')?.click(); true");
  await wait(200);
  await assertPage("mobile search cleanup clears query", "document.querySelector('.librarian-search input')?.value === '' && document.querySelectorAll('.ranked-skill-card').length === 0");
  await evaluate("[...document.querySelectorAll('.nav-button')].find((el) => el.textContent.trim() === 'CATALOG')?.click(); true");
  await wait(300);
  await assertPage(
    "mobile Catalog exposes a category entry in its first viewport with 44px navigation targets",
    `(() => {
      const card = document.querySelector('.catalog-category-card')?.getBoundingClientRect();
      const nav = [...document.querySelectorAll('.topnav .nav-button')].map((button) => button.getBoundingClientRect());
      return Boolean(card && card.top < innerHeight && card.bottom > 0 && nav.length === 4 && nav.every((box) => box.width >= 44 && box.height >= 44));
    })()`,
  );
  await evaluate("[...document.querySelectorAll('.catalog-category-card')].find((el) => el.textContent.includes('个人知识库与本地工具'))?.click()");
  await wait(500);
  await assertPage(
    "mobile standalone Skills reflow to one safe column",
    `(() => {
      const grid = document.querySelector('.standalone-skill-grid');
      const cards = [...(grid?.querySelectorAll('.standalone-skill-card') ?? [])];
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      return Boolean(grid && cards.length > 0 && columns === 1)
        && cards.every((card) => {
          const box = card.getBoundingClientRect();
          return box.width >= 44 && box.left >= 0 && box.right <= innerWidth
            && getComputedStyle(card).overflowX !== 'scroll';
        })
        && document.documentElement.scrollWidth === innerWidth;
    })()`,
  );
  await evaluate("document.querySelector('.command-search input')?.focus(); true");
  await cdp("Input.insertText", { text: "obsidian" });
  await wait(400);
  await evaluate("[...document.querySelectorAll('.unit-card-main')].find((el) => el.textContent.includes('obsidian'))?.click()");
  await wait(500);
  await evaluate("document.querySelector('.skill-row')?.click(); true");
  await wait(400);
  await evaluate("(() => { const dialog = document.querySelector('[role=\"dialog\"]'); if (dialog) dialog.scrollTop = dialog.scrollHeight; return true; })()");
  await wait(100);
  await assertPage(
    "mobile inspector scrolls with close button visible",
    "(() => { const dialog = document.querySelector('[role=\"dialog\"]'); const close = dialog?.querySelector('.icon-button'); const dialogBox = dialog?.getBoundingClientRect(); const closeBox = close?.getBoundingClientRect(); return Boolean(dialog && close && dialogBox && closeBox && getComputedStyle(dialog).overflowY === 'auto' && dialog.scrollHeight > dialog.clientHeight && closeBox.top >= dialogBox.top && closeBox.bottom <= Math.min(dialogBox.bottom, innerHeight)); })()",
  );
  await evaluate("document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await wait(200);
  await assertPage("mobile inspector closes with escape", "!document.querySelector('[role=\"dialog\"]')");
  if (browserIssues.length > 0) {
    throw new Error(`UI smoke saw ${browserIssues.length} console/runtime errors: ${JSON.stringify(browserIssues)}`);
  }
  console.log("ok browser console/runtime errors = 0");
} finally {
  await cleanup();
}
