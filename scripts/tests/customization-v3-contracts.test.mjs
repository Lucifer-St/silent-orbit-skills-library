import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const schemasRoot = path.join(packageRoot, "schemas");

function normalizedDigest(target) {
  const text = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

test("v3 novice and structure contracts are additive companions with a deterministic lock", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(schemasRoot, "schema-lock.v3.json"), "utf8"));
  assert.equal(lock.schemaVersion, 3);
  assert.equal(lock.releaseStatus, "prerelease");
  assert.equal(lock.releaseVersion, "0.13.0-beta.1");
  assert.equal(lock.basedOnRelease, "0.12.0-beta.1");
  assert.equal(lock.cliInterfaceVersion, "0.6.0");
  assert.equal(lock.compatibilityFamily, "customization-experience-v3-companion");
  assert.deepEqual(lock.migration, {
    changesV1: false,
    changesV2: false,
    existingV2Projects: "remain-readable",
    upgradePath: "run read-only preflight, confirm project-only onboarding, then complete or resume the novice interview; a redesign creates v3 structure-bearing candidates without rewriting v2 history",
  });
  const actual = [
    ...fs.readdirSync(schemasRoot).filter((name) => name.endsWith(".v3.schema.json")),
    "novice-human-test-report.schema.json",
  ].sort();
  assert.deepEqual(actual, lock.schemas.map((entry) => entry.path).sort());
  for (const entry of lock.schemas) {
    assert.equal(normalizedDigest(path.join(schemasRoot, entry.path)), entry.sha256, entry.path);
  }
});

test("published customization v2 lock remains byte-compatible and does not absorb v3 fields", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(schemasRoot, "schema-lock.v2.json"), "utf8"));
  assert.equal(lock.releaseVersion, "0.12.0-beta.1");
  assert.equal(lock.cliInterfaceVersion, "0.5.0");
  for (const entry of lock.schemas) {
    assert.equal(normalizedDigest(path.join(schemasRoot, entry.path)), entry.sha256, `${entry.path} changed after beta.1`);
    const schema = fs.readFileSync(path.join(schemasRoot, entry.path), "utf8");
    assert.doesNotMatch(schema, /CustomizationExperienceV3|preferredView|structureDigest|CustomizationInterviewV3/);
  }
});

test("v3 interview schema binds each answer map key to the same question identity", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(schemasRoot, "customization-interview.v3.schema.json"), "utf8"));
  const expected = {
    "familiar-places": "familiarPlacesAnswer",
    avoid: "avoidAnswer",
    feeling: "feelingAnswer",
    "find-things": "findThingsAnswer",
    "reading-surface": "readingSurfaceAnswer",
    comfort: "comfortAnswer",
  };
  for (const [questionId, definition] of Object.entries(expected)) {
    assert.equal(schema.properties.answers.properties[questionId].$ref, `#/$defs/${definition}`);
    assert.equal(schema.$defs[definition].allOf[1].properties.questionId.const, questionId);
  }
});
