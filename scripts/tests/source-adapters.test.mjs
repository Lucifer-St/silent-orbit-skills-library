import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createCodexGlobalSkillsAdapter,
  createCodexPluginAdapter,
  createNormalizedJsonAdapter,
  createSkillDirectoryAdapter,
  parseSkillFrontmatter,
  scanInventorySources,
} from "../lib/source-adapters.mjs";

const generatedAt = "2026-07-21T12:00:00.000Z";
const projectConfig = {
  schemaVersion: 1,
  projectId: "portable-library",
  title: { "en-US": "Portable Library" },
  locales: ["en-US"],
  defaultLocale: "en-US",
  renderer: { theme: "silent-orbit", defaultRoute: "/" },
  privacy: {
    defaultVisibility: "public",
    publicVisibilities: ["public", "creator-showcase"],
    publishRawPaths: false,
    publishHashes: false,
    publishUsageEvidence: false,
  },
};

function temporaryDirectory(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `silent-orbit-${label}-`));
}

function writeSkill(root, relativeDirectory, markdown) {
  const directory = path.join(root, ...relativeDirectory.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "SKILL.md"), markdown, "utf8");
}

function scan(adapters, options = {}) {
  return scanInventorySources({ projectConfig, generatedAt, adapters, ...options });
}

test("frontmatter parsing supports quoted and folded values without reading the Skill body", () => {
  const metadata = parseSkillFrontmatter([
    "---",
    "name: 'portable-skill'",
    "description: >",
    "  A portable",
    "  description.",
    "version: 1.2.3",
    "---",
    "PRIVATE BODY MUST NOT BE PARSED",
  ].join("\n"));
  assert.deepEqual(metadata, { name: "portable-skill", description: "A portable description.", version: "1.2.3" });
});

test("generic directory scans are content-stable across different machine roots", (t) => {
  const firstRoot = temporaryDirectory("directory-a");
  const secondRoot = temporaryDirectory("directory-b");
  t.after(() => {
    fs.rmSync(firstRoot, { recursive: true, force: true });
    fs.rmSync(secondRoot, { recursive: true, force: true });
  });
  const markdown = [
    "---",
    "name: portable-skill",
    "description: Works on any machine.",
    "trigger: $portable-skill",
    "version: 1.0.0",
    "repository: https://example.com/portable-skill",
    "---",
    "Local instructions stay outside InventorySnapshotV1.",
  ].join("\n");
  writeSkill(firstRoot, "nested/portable-skill", markdown);
  writeSkill(secondRoot, "another/layout/portable-skill", markdown);
  const first = scan([createSkillDirectoryAdapter({ sourceKey: "portable-folder", root: firstRoot, label: "Portable Folder" })]);
  const second = scan([createSkillDirectoryAdapter({ sourceKey: "portable-folder", root: secondRoot, label: "Portable Folder" })]);
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.equal(first.snapshot.items[0].observed.description, "Works on any machine.");
  assert.equal(first.snapshot.items[0].observed.trigger, "$portable-skill");
  assert.doesNotMatch(JSON.stringify(first.snapshot), /silent-orbit-directory|SKILL\.md|Local instructions/);
});

test("Codex global scans ignore Windows, macOS, and Linux path differences", () => {
  const markdown = "---\nname: shared-skill\ndescription: Shared metadata.\n---\nPrivate body";
  const builds = [
    ["C:", "Users", "Alice", ".agents", "skills", "shared-skill"].join("\\"),
    ["", "Users", "alice", ".agents", "skills", "shared-skill"].join("/"),
    ["", "home", "alice", ".agents", "skills", "shared-skill"].join("/"),
  ].map((entryPath) => scan([createCodexGlobalSkillsAdapter({ entries: [{ name: "shared-skill", path: entryPath, scope: "global", skillMarkdown: markdown }] })]).snapshot);
  assert.deepEqual(builds[0], builds[1]);
  assert.deepEqual(builds[1], builds[2]);
  assert.equal(builds[0].sources[0].capabilities.updateChannel, "source-managed");
  assert.doesNotMatch(JSON.stringify(builds[0]), /Alice|alice|Users|home/);
});

test("Codex plugin manifests produce external read-only sources and inherited metadata", (t) => {
  const pluginRoot = temporaryDirectory("plugin");
  t.after(() => fs.rmSync(pluginRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({
    name: "demo-plugin",
    displayName: "Demo Plugin",
    version: "2.4.0",
    author: { name: "Example Studio" },
    repository: "https://example.com/demo-plugin",
    skills: ["skills/plugin-skill"],
  }), "utf8");
  writeSkill(pluginRoot, "skills/plugin-skill", "---\nname: plugin-skill\ndescription: Plugin capability.\n---\n");
  const { snapshot } = scan([createCodexPluginAdapter({ sourceKey: "demo-plugin", pluginRoot })]);
  assert.equal(snapshot.sources[0].providerKind, "codex-plugin");
  assert.equal(snapshot.sources[0].capabilities.updateChannel, "external");
  assert.equal(snapshot.sources[0].capabilities.write, false);
  assert.equal(snapshot.items[0].observed.version, "2.4.0");
  assert.equal(snapshot.items[0].observed.author, "Example Studio");
  assert.equal(snapshot.items[0].observed.sourceUrl, "https://example.com/demo-plugin");
});

test("normalized JSON import keeps creator showcase and excludes local-only records", () => {
  const input = {
    schemaVersion: 1,
    source: { key: "portable-import", label: "Portable Import", providerKind: "json-export", sourceUrl: "https://example.com/library" },
    skills: [
      { name: "creator-example", origin: "creator", visibility: "creator-showcase", description: "Public creator example." },
      { name: "private-example", origin: "creator", visibility: "local-only", description: ["C:", "Users", "Alice", "private"].join("\\") },
      { name: "safe-example", description: "Use token sk-example1234567890" },
    ],
  };
  const { snapshot, report } = scan([createNormalizedJsonAdapter({ input })]);
  assert.deepEqual(snapshot.items.map((item) => item.name), ["creator-example", "safe-example"]);
  assert.equal(snapshot.items[0].visibility, "creator-showcase");
  assert.equal(snapshot.items[0].origin, "creator");
  assert.equal(snapshot.items[1].observed, undefined);
  assert.equal(report.excludedLocalOnly, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /private-example|Alice|sk-example/);
  assert.ok(snapshot.diagnostics.some((entry) => entry.code === "unsafe-metadata-omitted"));
});

test("normalized JSON import rejects fields outside the SourceImportV1 allowlist", () => {
  const input = {
    schemaVersion: 1,
    source: { key: "unsafe-import", label: "Unsafe Import" },
    skills: [{ name: "unsafe", installedPath: ["C:", "Users", "Alice", "unsafe"].join("\\") }],
  };
  const { snapshot } = scan([createNormalizedJsonAdapter({ input })]);
  assert.equal(snapshot.sources[0].scanState, "failed");
  assert.equal(snapshot.items.length, 0);
  assert.equal(snapshot.diagnostics[0].code, "import-contract-invalid");
  assert.doesNotMatch(JSON.stringify(snapshot), /installedPath|Alice/);
});

test("creator-showcase without established creator origin is excluded with a safe diagnostic", () => {
  const input = {
    schemaVersion: 1,
    source: { key: "unverified-author", label: "Unverified Author" },
    skills: [{ name: "unverified-skill", visibility: "creator-showcase", origin: "unknown" }],
  };
  const { snapshot } = scan([createNormalizedJsonAdapter({ input })]);
  assert.equal(snapshot.items.length, 0);
  assert.equal(snapshot.diagnostics[0].code, "creator-showcase-origin");
});

test("explicit governance overrides can establish creator showcase without changing source files", () => {
  const input = {
    schemaVersion: 1,
    source: { key: "creator-source", label: "Creator Source" },
    skills: [{ name: "creator-skill", description: "Public capability only." }],
  };
  const { snapshot } = scan([createNormalizedJsonAdapter({ input })], {
    governanceOverrides: [{ sourceKey: "creator-source", name: "creator-skill", origin: "creator", visibility: "creator-showcase" }],
  });
  assert.equal(snapshot.items[0].origin, "creator");
  assert.equal(snapshot.items[0].visibility, "creator-showcase");
});

test("review-first projects retain unconfirmed records in Inventory without publishing them", () => {
  const reviewConfig = structuredClone(projectConfig);
  reviewConfig.privacy.defaultVisibility = "review-required";
  const input = { schemaVersion: 1, source: { key: "review-source", label: "Review Source" }, skills: [{ name: "unconfirmed" }] };
  const { snapshot, report } = scanInventorySources({
    projectConfig: reviewConfig,
    generatedAt,
    adapters: [createNormalizedJsonAdapter({ input })],
  });
  assert.equal(snapshot.items[0].visibility, "review-required");
  assert.equal(report.reviewRequired, 1);
  assert.equal(report.publishedItems, 0);
  assert.equal(report.excludedLocalOnly, 0);
});

test("missing sources fail locally without leaking configured paths", () => {
  const missing = path.join(os.tmpdir(), "silent-orbit-does-not-exist", "Alice");
  const { snapshot } = scan([createSkillDirectoryAdapter({ sourceKey: "missing-source", root: missing, label: "Missing Source" })]);
  assert.equal(snapshot.sources[0].scanState, "failed");
  assert.equal(snapshot.items.length, 0);
  assert.equal(snapshot.summary.errors, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /does-not-exist|Alice/);
});

test("one failed provider does not discard successful read-only sources", () => {
  const missing = path.join(os.tmpdir(), "silent-orbit-missing-provider");
  const healthy = createNormalizedJsonAdapter({ input: { schemaVersion: 1, source: { key: "healthy", label: "Healthy" }, skills: [{ name: "available-skill" }] } });
  const failed = createSkillDirectoryAdapter({ sourceKey: "failed", root: missing, label: "Failed" });
  const { snapshot } = scan([failed, healthy]);
  assert.deepEqual(snapshot.sources.map((source) => source.scanState).sort(), ["complete", "failed"]);
  assert.deepEqual(snapshot.items.map((item) => item.name), ["available-skill"]);
  assert.equal(snapshot.summary.errors, 1);
});

test("duplicate names select a deterministic record and report partial source state", () => {
  const input = {
    schemaVersion: 1,
    source: { key: "duplicates", label: "Duplicates" },
    skills: [
      { name: "same-name", description: "Zulu" },
      { name: "same-name", description: "Alpha" },
    ],
  };
  const forward = scan([createNormalizedJsonAdapter({ input })]).snapshot;
  const reverse = scan([createNormalizedJsonAdapter({ input: { ...input, skills: [...input.skills].reverse() } })]).snapshot;
  assert.deepEqual(forward, reverse);
  assert.equal(forward.items[0].observed.description, "Alpha");
  assert.equal(forward.sources[0].scanState, "partial");
  assert.equal(forward.diagnostics[0].code, "duplicate-skill");
});

test("adapter order cannot change the normalized inventory snapshot", () => {
  const first = createNormalizedJsonAdapter({ input: { schemaVersion: 1, source: { key: "source-a", label: "A" }, skills: [{ name: "alpha" }] } });
  const second = createNormalizedJsonAdapter({ input: { schemaVersion: 1, source: { key: "source-b", label: "B" }, skills: [{ name: "beta" }] } });
  assert.deepEqual(scan([first, second]).snapshot, scan([second, first]).snapshot);
});

test("diagnostics and summaries remain internally consistent and path-free", () => {
  const privatePath = ["C:", "Users", "Alice", "missing"].join("\\");
  const { snapshot } = scan([createCodexGlobalSkillsAdapter({ entries: [{ name: "missing-skill", path: privatePath }] })]);
  assert.equal(snapshot.items[0].state, "unknown");
  assert.equal(snapshot.summary.sources, snapshot.sources.length);
  assert.equal(snapshot.summary.items, snapshot.items.length);
  assert.equal(snapshot.summary.warnings, snapshot.diagnostics.length);
  assert.equal(snapshot.diagnostics[0].itemId, snapshot.items[0].id);
  assert.doesNotMatch(JSON.stringify(snapshot), /Alice|missing\\|path|hash/i);
});
