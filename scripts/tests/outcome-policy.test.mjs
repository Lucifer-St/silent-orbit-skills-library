import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

async function loadModule(path) {
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    root: process.cwd(),
    server: { middlewareMode: true },
  });
  try {
    return await server.ssrLoadModule(path);
  } finally {
    await server.close();
  }
}

const loadOutcomePolicy = () => loadModule("/src/lib/outcomePolicy.ts");
const loadPersonalStore = () => loadModule("/src/lib/personalStore.ts");
const loadCatalogRevision = () => loadModule("/src/lib/catalogRevision.ts");

const draft = (title, revision = "rev-a") => ({ skillId: "aihot", title, catalogRevision: revision });

const storedOutcome = (id, skillId = "aihot", completedAt = "2026-01-01T00:00:00.000Z") => ({
  id,
  skillId,
  title: `Outcome ${id}`,
  completedAt,
  catalogRevision: "rev-a",
});

const storedTombstone = (
  skillId = "aihot",
  deletedAt = "2026-01-02T00:00:00.000Z",
  unlockAt = "2026-02-01T00:00:00.000Z",
) => ({ skillId, deletedAt, unlockAt, deletedCatalogRevision: "rev-a" });

function createMemoryStorage(entries = []) {
  const memory = new Map(entries);
  return {
    memory,
    storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    },
  };
}

test("blocks a second outcome inside 30 days", async () => {
  const { emptyPersonalData, recordOutcome, canCreateOutcome } = await loadOutcomePolicy();
  const data = recordOutcome(emptyPersonalData(), draft("week one"), new Date("2026-01-01T00:00:00.000Z"));
  assert.deepEqual(canCreateOutcome(data, "aihot", "rev-a", new Date("2026-01-10T00:00:00.000Z")), {
    allowed: false,
    reason: "cooldown",
    unlockAt: "2026-01-31T00:00:00.000Z",
  });
});

test("allows a new outcome after 30 days", async () => {
  const { emptyPersonalData, recordOutcome, canCreateOutcome } = await loadOutcomePolicy();
  const data = recordOutcome(emptyPersonalData(), draft("week one"), new Date("2026-01-01T00:00:00.000Z"));
  assert.deepEqual(canCreateOutcome(data, "aihot", "rev-a", new Date("2026-02-01T00:00:00.000Z")), { allowed: true });
});

test("deletion creates a tombstone", async () => {
  const { emptyPersonalData, recordOutcome, deleteOutcome } = await loadOutcomePolicy();
  const saved = recordOutcome(emptyPersonalData(), draft("week one"), new Date("2026-01-01T00:00:00.000Z"));
  const deleted = deleteOutcome(saved, saved.outcomes[0].id, new Date("2026-01-05T00:00:00.000Z"));
  assert.equal(deleted.data.outcomes.length, 0);
  assert.deepEqual(deleted.data.tombstones[0], {
    skillId: "aihot",
    deletedAt: "2026-01-05T00:00:00.000Z",
    unlockAt: "2026-02-04T00:00:00.000Z",
    deletedCatalogRevision: "rev-a",
  });
});

test("catalog revision change unlocks a tombstone", async () => {
  const { emptyPersonalData, recordOutcome, deleteOutcome, canCreateOutcome } = await loadOutcomePolicy();
  const saved = recordOutcome(emptyPersonalData(), draft("week one"), new Date("2026-01-01T00:00:00.000Z"));
  const deleted = deleteOutcome(saved, saved.outcomes[0].id, new Date("2026-01-05T00:00:00.000Z"));
  assert.deepEqual(canCreateOutcome(deleted.data, "aihot", "rev-b", new Date("2026-01-06T00:00:00.000Z")), { allowed: true });
});

test("manual unlock removes a tombstone", async () => {
  const { emptyPersonalData, recordOutcome, deleteOutcome, unlockSkill, canCreateOutcome } = await loadOutcomePolicy();
  const saved = recordOutcome(emptyPersonalData(), draft("week one"), new Date("2026-01-01T00:00:00.000Z"));
  const deleted = deleteOutcome(saved, saved.outcomes[0].id, new Date("2026-01-05T00:00:00.000Z"));
  const unlocked = unlockSkill(deleted.data, "aihot");
  assert.deepEqual(canCreateOutcome(unlocked, "aihot", "rev-a", new Date("2026-01-06T00:00:00.000Z")), { allowed: true });
});

test("keeps at most three outcomes per skill", async () => {
  const { emptyPersonalData, recordOutcome } = await loadOutcomePolicy();
  const dates = ["2026-01-01", "2026-02-01", "2026-03-04", "2026-04-04"];
  const data = dates.reduce(
    (state, date, index) => recordOutcome(state, draft(`outcome-${index + 1}`), new Date(`${date}T00:00:00.000Z`)),
    emptyPersonalData(),
  );
  assert.deepEqual(data.outcomes.map((outcome) => outcome.title), ["outcome-4", "outcome-3", "outcome-2"]);
});

test("rejects invalid imports without replacing current data", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  store.replace({ schemaVersion: 1, outcomes: [], tombstones: [] });
  assert.throws(() => store.importJson('{"schemaVersion":2}'), /Unsupported personal data schema/);
  assert.deepEqual(store.load(), { schemaVersion: 1, outcomes: [], tombstones: [] });
});

test("catalog revision is stable and changes for every catalog-visible field", async () => {
  const { catalogRevision } = await loadCatalogRevision();
  const skill = {
    name: "aihot",
    description: "AI news",
    trigger: "$aihot",
    category: "research",
    library_key: "private",
    library_title: "Private",
    status: "active",
    repo_url: "https://example.test/aihot",
  };
  const baseline = catalogRevision(skill);
  assert.match(baseline, /^[0-9a-f]{8}$/);
  assert.equal(catalogRevision({ ...skill }), baseline);
  for (const [field, value] of [
    ["name", "aihot-2"],
    ["description", "Updated AI news"],
    ["trigger", "$aihot-2"],
    ["category", "media"],
    ["library_key", "public"],
    ["status", "archived"],
    ["repo_url", "https://example.test/aihot-2"],
  ]) {
    assert.notEqual(catalogRevision({ ...skill, [field]: value }), baseline, `${field} must affect the revision`);
  }
  assert.equal(catalogRevision({ ...skill, generatedAt: "2099-01-01", library_title: "Renamed" }), baseline);
});

test("recordOutcome keeps at most 200 outcomes total", async () => {
  const { emptyPersonalData, recordOutcome } = await loadOutcomePolicy();
  let data = emptyPersonalData();
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  for (let index = 0; index < 201; index += 1) {
    data = recordOutcome(
      data,
      { skillId: `skill-${index}`, title: `outcome-${index}`, catalogRevision: "rev-a" },
      new Date(start + index * 1000),
    );
  }
  assert.equal(data.outcomes.length, 200);
  assert.equal(data.outcomes[0].title, "outcome-200");
  assert.equal(data.outcomes.at(-1).title, "outcome-1");
});

test("canCreateOutcome checks cooldown, then tombstone, then capacity", async () => {
  const { canCreateOutcome } = await loadOutcomePolicy();
  const outcomes = Array.from({ length: 200 }, (_, index) => ({
    id: `id-${index}`,
    skillId: index === 0 ? "cooldown-skill" : `skill-${index}`,
    title: `outcome-${index}`,
    completedAt: index === 0 ? "2026-01-01T00:00:00.000Z" : "2025-01-01T00:00:00.000Z",
    catalogRevision: "rev-a",
  }));
  const data = {
    schemaVersion: 1,
    outcomes,
    tombstones: [
      { skillId: "cooldown-skill", deletedAt: "2026-01-02T00:00:00.000Z", unlockAt: "2026-02-01T00:00:00.000Z", deletedCatalogRevision: "rev-a" },
      { skillId: "tombstone-skill", deletedAt: "2026-01-02T00:00:00.000Z", unlockAt: "2026-02-01T00:00:00.000Z", deletedCatalogRevision: "rev-a" },
    ],
  };
  const now = new Date("2026-01-10T00:00:00.000Z");
  assert.equal(canCreateOutcome(data, "cooldown-skill", "rev-a", now).reason, "cooldown");
  assert.equal(canCreateOutcome(data, "tombstone-skill", "rev-a", now).reason, "tombstone");
  assert.deepEqual(canCreateOutcome(data, "new-skill", "rev-a", now), { allowed: false, reason: "capacity" });
});

test("backs up corrupt stored data and returns empty personal data", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const raw = '{"schemaVersion":1,"outcomes":[';
  const { memory, storage } = createMemoryStorage([["personal-agent-os.personal-data.v1", raw]]);
  const store = createPersonalStore(storage);
  assert.deepEqual(store.load(), { schemaVersion: 1, outcomes: [], tombstones: [] });
  assert.equal(memory.get("personal-agent-os.personal-data.invalid-backup"), raw);
});

test("accepts valid replace and import payloads", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const first = {
    schemaVersion: 1,
    outcomes: [{ id: "one", skillId: "aihot", title: "One", completedAt: "2026-01-01T00:00:00.000Z", note: "note", artifactRef: "local://one", catalogRevision: "rev-a", pinned: true }],
    tombstones: [],
  };
  const second = {
    schemaVersion: 1,
    outcomes: [],
    tombstones: [{ skillId: "aihot", deletedAt: "2026-01-02T00:00:00.000Z", unlockAt: "2026-02-01T00:00:00.000Z", deletedCatalogRevision: "rev-a" }],
  };
  store.replace(first);
  assert.deepEqual(store.load(), first);
  store.importJson(JSON.stringify(second));
  assert.deepEqual(store.load(), second);
});

test("rejects malformed nested records without replacing current data", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const current = { schemaVersion: 1, outcomes: [], tombstones: [] };
  store.replace(current);
  assert.throws(
    () => store.importJson(JSON.stringify({ schemaVersion: 1, outcomes: [{ id: 42 }], tombstones: [] })),
    /Invalid personal data/,
  );
  assert.deepEqual(store.load(), current);
});

test("rejects invalid and non-canonical outcome and tombstone dates", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const current = { schemaVersion: 1, outcomes: [], tombstones: [] };
  store.replace(current);
  const invalidPayloads = [
    { schemaVersion: 1, outcomes: [storedOutcome("invalid", "aihot", "not-a-date")], tombstones: [] },
    { schemaVersion: 1, outcomes: [storedOutcome("noncanonical", "aihot", "2026-01-01T00:00:00Z")], tombstones: [] },
    { schemaVersion: 1, outcomes: [], tombstones: [storedTombstone("aihot", "not-a-date")] },
    { schemaVersion: 1, outcomes: [], tombstones: [storedTombstone("aihot", "2026-01-02T00:00:00.000Z", "not-a-date")] },
    { schemaVersion: 1, outcomes: [], tombstones: [storedTombstone("aihot", "2026-01-02T00:00:00.000Z", "2026-02-02T00:00:00.000Z")] },
  ];
  for (const payload of invalidPayloads) {
    assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/);
    assert.throws(() => store.replace(payload), /Invalid personal data/);
    assert.deepEqual(store.load(), current);
  }
});

test("rejects duplicate outcome ids", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const payload = {
    schemaVersion: 1,
    outcomes: [storedOutcome("duplicate", "aihot"), storedOutcome("duplicate", "other")],
    tombstones: [],
  };
  assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/);
  assert.throws(() => store.replace(payload), /Invalid personal data/);
});

test("rejects more than one tombstone for a skill", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const payload = {
    schemaVersion: 1,
    outcomes: [],
    tombstones: [
      storedTombstone("aihot"),
      storedTombstone("aihot", "2026-01-03T00:00:00.000Z", "2026-02-02T00:00:00.000Z"),
    ],
  };
  assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/);
  assert.throws(() => store.replace(payload), /Invalid personal data/);
});

test("rejects more than three outcomes for a skill", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const payload = {
    schemaVersion: 1,
    outcomes: Array.from({ length: 4 }, (_, index) => storedOutcome(`id-${index}`)),
    tombstones: [],
  };
  assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/);
  assert.throws(() => store.replace(payload), /Invalid personal data/);
});

test("rejects more than 200 outcomes total", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  const payload = {
    schemaVersion: 1,
    outcomes: Array.from({ length: 201 }, (_, index) => storedOutcome(`id-${index}`, `skill-${index}`)),
    tombstones: [],
  };
  assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/);
  assert.throws(() => store.replace(payload), /Invalid personal data/);
});

test("rejects empty tombstone skill and revision identifiers", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  for (const tombstone of [
    storedTombstone(""),
    { ...storedTombstone("aihot"), deletedCatalogRevision: "" },
  ]) {
    const payload = { schemaVersion: 1, outcomes: [], tombstones: [tombstone] };
    assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/);
    assert.throws(() => store.replace(payload), /Invalid personal data/);
  }
});

test("deleteOutcome replaces every older tombstone for the same skill", async () => {
  const { deleteOutcome } = await loadOutcomePolicy();
  const data = {
    schemaVersion: 1,
    outcomes: [storedOutcome("delete-me")],
    tombstones: [
      storedTombstone("aihot", "2026-01-01T00:00:00.000Z", "2026-01-31T00:00:00.000Z"),
      storedTombstone("aihot"),
      storedTombstone("other"),
    ],
  };
  const result = deleteOutcome(data, "delete-me", new Date("2026-01-05T00:00:00.000Z"));
  assert.deepEqual(result.data.tombstones, [
    storedTombstone("aihot", "2026-01-05T00:00:00.000Z", "2026-02-04T00:00:00.000Z"),
    storedTombstone("other"),
  ]);
});

test("canCreateOutcome uses the latest matching tombstone from non-normalized data", async () => {
  const { canCreateOutcome } = await loadOutcomePolicy();
  const data = {
    schemaVersion: 1,
    outcomes: [],
    tombstones: [
      storedTombstone("aihot", "2026-01-05T00:00:00.000Z", "2026-02-04T00:00:00.000Z"),
      storedTombstone("aihot", "2026-01-11T00:00:00.000Z", "2026-02-10T00:00:00.000Z"),
    ],
  };
  assert.deepEqual(canCreateOutcome(data, "aihot", "rev-a", new Date("2026-02-05T00:00:00.000Z")), {
    allowed: false,
    reason: "tombstone",
    unlockAt: "2026-02-10T00:00:00.000Z",
  });
});

test("recordOutcome retains newest outcomes from shuffled input with deterministic ties", async () => {
  const { recordOutcome } = await loadOutcomePolicy();
  const data = {
    schemaVersion: 1,
    outcomes: [
      storedOutcome("jan", "aihot", "2026-01-01T00:00:00.000Z"),
      storedOutcome("march-b", "aihot", "2026-03-01T00:00:00.000Z"),
      storedOutcome("feb", "aihot", "2026-02-01T00:00:00.000Z"),
      storedOutcome("march-a", "aihot", "2026-03-01T00:00:00.000Z"),
    ],
    tombstones: [],
  };
  const result = recordOutcome(data, draft("April"), new Date("2026-04-01T00:00:00.000Z"));
  assert.deepEqual(result.outcomes.map((outcome) => outcome.id), [
    "aihot:2026-04-01T00:00:00.000Z",
    "march-a",
    "march-b",
  ]);
});

test("recordOutcome applies the total cap after sorting newest first", async () => {
  const { recordOutcome } = await loadOutcomePolicy();
  const start = Date.parse("2025-01-01T00:00:00.000Z");
  const outcomes = Array.from({ length: 200 }, (_, index) =>
    storedOutcome(`id-${index}`, `skill-${index}`, new Date(start + index * 1000).toISOString()),
  );
  const result = recordOutcome(
    { schemaVersion: 1, outcomes, tombstones: [] },
    { skillId: "new-skill", title: "Newest", catalogRevision: "rev-a" },
    new Date(start + 201 * 1000),
  );
  assert.equal(result.outcomes.length, 200);
  assert.equal(result.outcomes[0].title, "Newest");
  assert.ok(result.outcomes.some((outcome) => outcome.id === "id-199"));
  assert.ok(!result.outcomes.some((outcome) => outcome.id === "id-0"));
});

test("corrupt load returns empty data when writing the backup fails", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const store = createPersonalStore({
    getItem: () => '{"schemaVersion":1',
    setItem: () => {
      throw new Error("backup blocked");
    },
    removeItem: () => {},
  });
  assert.deepEqual(store.load(), { schemaVersion: 1, outcomes: [], tombstones: [] });
});

test("replace and import surface primary storage write failures", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const store = createPersonalStore({
    getItem: () => null,
    setItem: () => {
      throw new Error("primary blocked");
    },
    removeItem: () => {},
  });
  const valid = { schemaVersion: 1, outcomes: [], tombstones: [] };
  assert.throws(() => store.replace(valid), /primary blocked/);
  assert.throws(() => store.importJson(JSON.stringify(valid)), /primary blocked/);
});

test("import and replace reject empty outcome identity and title fields", async () => {
  const { createPersonalStore } = await loadPersonalStore();
  const { storage } = createMemoryStorage();
  const store = createPersonalStore(storage);
  for (const field of ["id", "skillId", "title", "catalogRevision"]) {
    for (const value of ["", "   "]) {
      const payload = {
        schemaVersion: 1,
        outcomes: [{ ...storedOutcome("valid"), [field]: value }],
        tombstones: [],
      };
      assert.throws(() => store.importJson(JSON.stringify(payload)), /Invalid personal data/, `${field} import`);
      assert.throws(() => store.replace(payload), /Invalid personal data/, `${field} replace`);
    }
  }
});

test("recordOutcome rejects empty skill, title, and catalog revision draft fields", async () => {
  const { emptyPersonalData, recordOutcome } = await loadOutcomePolicy();
  for (const field of ["skillId", "title", "catalogRevision"]) {
    for (const value of ["", "   "]) {
      assert.throws(
        () => recordOutcome(
          emptyPersonalData(),
          { skillId: "aihot", title: "Outcome", catalogRevision: "rev-a", [field]: value },
          new Date("2026-01-01T00:00:00.000Z"),
        ),
        new RegExp(`${field} must be a non-empty string`),
      );
    }
  }
});

test("updateOutcome edits one record in place without sliding its completion period", async () => {
  const { updateOutcome } = await loadOutcomePolicy();
  const original = {
    schemaVersion: 1,
    outcomes: [
      {
        id: "aihot:2026-07-01T12:00:00.000Z",
        skillId: "aihot",
        title: "Original outcome",
        completedAt: "2026-07-01T12:00:00.000Z",
        note: "Old note",
        artifactRef: "local://old",
        catalogRevision: "rev-a",
        pinned: true,
      },
      {
        id: "other:2026-06-01T12:00:00.000Z",
        skillId: "other",
        title: "Sibling outcome",
        completedAt: "2026-06-01T12:00:00.000Z",
        catalogRevision: "rev-a",
      },
    ],
    tombstones: [storedTombstone("deleted-skill")],
  };

  const updated = updateOutcome(original, original.outcomes[0].id, {
    title: "Updated outcome",
    note: "New note",
    artifactRef: "local://new",
    catalogRevision: "rev-b",
  });

  assert.equal(updated.outcomes.length, 2);
  assert.deepEqual(updated.outcomes[0], {
    id: "aihot:2026-07-01T12:00:00.000Z",
    skillId: "aihot",
    title: "Updated outcome",
    completedAt: "2026-07-01T12:00:00.000Z",
    note: "New note",
    artifactRef: "local://new",
    catalogRevision: "rev-b",
    pinned: true,
  });
  assert.deepEqual(updated.outcomes[1], original.outcomes[1]);
  assert.deepEqual(updated.tombstones, original.tombstones);
});

test("updateOutcome rejects an unknown outcome id instead of reporting success", async () => {
  const { updateOutcome } = await loadOutcomePolicy();
  const data = {
    schemaVersion: 1,
    outcomes: [storedOutcome("existing")],
    tombstones: [],
  };

  assert.throws(
    () => updateOutcome(data, "missing", { title: "Edited", catalogRevision: "rev-b" }),
    /Outcome not found: missing/,
  );
});

test("currentPeriodOutcome includes just before cooldown and excludes its exact boundary", async () => {
  const { currentPeriodOutcome, OUTCOME_COOLDOWN_MS } = await loadOutcomePolicy();
  const completedAt = "2026-01-01T00:00:00.000Z";
  const completedTime = Date.parse(completedAt);
  const data = {
    schemaVersion: 1,
    outcomes: [
      storedOutcome("current", "aihot", completedAt),
      storedOutcome("older", "aihot", "2025-12-31T23:00:00.000Z"),
      storedOutcome("other", "other", "2026-01-15T00:00:00.000Z"),
    ],
    tombstones: [],
  };

  assert.equal(
    currentPeriodOutcome(data, "aihot", new Date(completedTime + OUTCOME_COOLDOWN_MS - 1))?.id,
    "current",
  );
  assert.equal(currentPeriodOutcome(data, "aihot", new Date(completedTime + OUTCOME_COOLDOWN_MS)), undefined);
  assert.equal(currentPeriodOutcome(data, "aihot", new Date(completedTime + OUTCOME_COOLDOWN_MS + 1)), undefined);
});

test("tryRecordOutcome retains cooldown tombstone and capacity denials", async () => {
  const { emptyPersonalData, recordOutcome, tryRecordOutcome } = await loadOutcomePolicy();
  const recent = recordOutcome(emptyPersonalData(), draft("first"), new Date("2026-01-01T00:00:00.000Z"));
  const cooldown = tryRecordOutcome(recent, draft("second"), new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(cooldown.allowed, false);
  assert.equal(cooldown.reason, "cooldown");
  assert.equal(recent.outcomes.length, 1);

  const tombstoned = {
    schemaVersion: 1,
    outcomes: [],
    tombstones: [storedTombstone("aihot")],
  };
  const tombstone = tryRecordOutcome(tombstoned, draft("blocked"), new Date("2026-01-10T00:00:00.000Z"));
  assert.equal(tombstone.allowed, false);
  assert.equal(tombstone.reason, "tombstone");

  const capacityData = {
    schemaVersion: 1,
    outcomes: Array.from({ length: 200 }, (_, index) => storedOutcome(`id-${index}`, `skill-${index}`)),
    tombstones: [],
  };
  const capacity = tryRecordOutcome(
    capacityData,
    { skillId: "new-skill", title: "blocked", catalogRevision: "rev-a" },
    new Date("2026-01-10T00:00:00.000Z"),
  );
  assert.equal(capacity.allowed, false);
  assert.equal(capacity.reason, "capacity");
});

test("tryRecordOutcome uses one now for permission and persisted completion time", async () => {
  const { emptyPersonalData, recordOutcome, tryRecordOutcome, OUTCOME_COOLDOWN_MS } = await loadOutcomePolicy();
  const firstAt = new Date("2026-01-01T00:00:00.000Z");
  const data = recordOutcome(emptyPersonalData(), draft("first"), firstAt);
  const sharedNow = new Date(firstAt.getTime() + OUTCOME_COOLDOWN_MS);

  const attempt = tryRecordOutcome(data, draft("second"), sharedNow);

  assert.equal(attempt.allowed, true);
  assert.equal(attempt.data.outcomes.find((outcome) => outcome.title === "second")?.completedAt, sharedNow.toISOString());
});
