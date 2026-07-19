import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const syncScript = path.join(projectDir, "scripts", "sync-data.mjs");
const generatedFile = path.join(projectDir, "src", "generated", "data.generated.ts");

function runSync() {
  const result = spawnSync(process.execPath, [syncScript], {
    cwd: projectDir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return fs.readFileSync(generatedFile, "utf8");
}

test("sync:data is deterministic for unchanged source data", () => {
  const first = runSync();
  const second = runSync();

  assert.equal(second, first);
  assert.match(first, /"generatedAt": "\d{4}-\d{2}-\d{2}T12:00:00\.000Z"/);
});
