import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveDataDir } from "../project-layout.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = resolveDataDir(projectDir);

test("public maintenance status is a sanitized handoff surface", () => {
  const status = JSON.parse(fs.readFileSync(path.join(dataDir, "maintenance-status.json"), "utf8"));
  const serialized = JSON.stringify(status);

  assert.equal(status.schemaVersion, 1);
  assert.equal(status.privacy, "sanitized");
  assert.match(status.snapshotDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(status.channels));
  assert.ok(status.channels.length > 0);
  assert.equal(typeof status.handoffPrompt?.["zh-CN"], "string");
  assert.equal(typeof status.handoffPrompt?.["en-US"], "string");
  assert.doesNotMatch(serialized, /[A-Za-z]:\\Users\\|\/Users\/|"task_count"\s*:|"visibility"\s*:\s*"local-only"/);
});
