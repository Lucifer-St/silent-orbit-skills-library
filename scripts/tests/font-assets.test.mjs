import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const fontAssets = [
  "public/fonts/fusion-pixel/fusion-pixel-12px-proportional-subset.woff2",
  "public/fonts/sarasa-term-sc/sarasa-term-sc-regular-subset.woff2",
];

const licenseAssets = [
  "public/fonts/fusion-pixel/OFL.txt",
  "public/fonts/sarasa-term-sc/OFL.txt",
];

test("self-hosts the required font and license assets", async () => {
  for (const relativePath of [...fontAssets, ...licenseAssets]) {
    const asset = await stat(path.join(appRoot, relativePath));
    assert.equal(asset.isFile(), true, `${relativePath} must be a file`);
  }
});

test("font subsets contain more than placeholder payloads", async () => {
  for (const relativePath of fontAssets) {
    const asset = await stat(path.join(appRoot, relativePath));
    assert.ok(asset.size > 10 * 1024, `${relativePath} is unexpectedly small`);
  }
});

test("the web fonts are bounded subsets rather than full source fonts", async () => {
  for (const relativePath of fontAssets) {
    const subset = await stat(path.join(appRoot, relativePath));
    assert.ok(subset.size < 5 * 1024 * 1024, `${relativePath} must remain below 5 MB`);
  }
});

test("font licenses include the SIL Open Font License", async () => {
  for (const relativePath of licenseAssets) {
    const license = await readFile(path.join(appRoot, relativePath), "utf8");
    assert.match(license, /SIL OPEN FONT LICENSE/i);
  }
});

test("font stylesheet declares the AgentPixel and AgentReading families", async () => {
  const stylesheet = await readFile(
    path.join(appRoot, "src/styles/fonts.css"),
    "utf8",
  );

  assert.match(stylesheet, /font-family:\s*["']AgentPixel["']/);
  assert.match(stylesheet, /font-family:\s*["']AgentReading["']/);
  assert.match(stylesheet, /--font-display:\s*var\(--font-pixel\)/);
  assert.match(stylesheet, /\.page-header h1,[\s\S]*font-family:\s*var\(--font-display\)/);
  assert.match(stylesheet, /p,[\s\S]*font-family:\s*var\(--font-reading\)/);
});
