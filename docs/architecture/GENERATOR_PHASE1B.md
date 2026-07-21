# Generator Phase 1B: portable read-only source adapters

Status: implemented on `codex/generator-phase1b`
Input contract: Generator Phase 1A (`InventorySnapshotV1`)

## Purpose

Phase 1B replaces the author-specific assumption that inventory already exists as catalog JSON with a provider-neutral, read-only scanning boundary. It does not yet implement the public `silent-orbit` CLI, automatic classification, website generation from a new user's data, or any operation that mutates installed Skills.

The public flow is now:

```text
Skill directory / Codex global list / plugin manifest / normalized JSON
  -> source adapter (read only)
  -> public metadata sanitizer + governance overrides
  -> InventorySnapshotV1
  -> future analyzer and LibrarySnapshotV1 builder
  -> existing renderer
```

The existing nine-file compatibility adapter remains the production input until the analyzer/generator phase can reproduce the current curated LibrarySnapshot without loss.

## Public adapter API

The implementation lives in `scripts/lib/source-adapters.mjs` and exports:

- `createSkillDirectoryAdapter`: recursively discovers `SKILL.md` files below an explicitly configured root.
- `createCodexGlobalSkillsAdapter`: consumes injected `npx skills list -g -a codex --json` entries or invokes that read-only discovery command.
- `createCodexPluginAdapter`: reads one configured plugin manifest and its conventional or declared Skill directories.
- `createNormalizedJsonAdapter`: imports the portable `SourceImportV1` JSON contract.
- `scanInventorySources`: merges adapters, applies governance, strips private evidence, resolves stable IDs, and emits one deterministic `InventorySnapshotV1`.

Adapters only expose observed public metadata:

- Skill name
- short description
- trigger
- version
- public author label
- public HTTP(S) source URL
- presence state and provider channel

They never copy the `SKILL.md` instruction body into the inventory.

## Stable identity

Every source needs a portable `sourceKey` supplied by configuration or normalized import data. Absolute paths are never identity inputs.

```text
source id = hash(sourceKey)
skill id  = hash(sourceKey + skill name)
```

Moving the same Skill tree between Windows, macOS, and Linux therefore produces the same IDs and the same snapshot when content, governance, and `generatedAt` are unchanged. Adapter and item order are canonicalized before snapshot hashing.

## Provider capabilities

Every source declares a read-only discovery contract and its true update owner:

| Provider | Discovery | Writes in Phase 1B | Update channel |
|---|---|---|---|
| Generic directory | read-only | none | unknown/configured |
| Codex global Skills | read-only | none | source-managed |
| Codex plugin | read-only | none | external plugin workflow |
| Normalized JSON | read-only | none | unknown/configured |

`capabilities.write` is always `false`. A future management layer must use a separate capability matrix, confirmation, backup, verification, and rollback contract; it cannot reinterpret a Phase 1B adapter as mutation authorization.

## Diagnostics and partial scans

An inventory source is one of:

- `complete`: all configured records were read and sanitized.
- `partial`: usable records exist, but one or more warnings/errors require attention.
- `failed`: the source could not be opened or parsed; other sources may still succeed.

Diagnostics contain stable codes and public-safe messages. They never contain raw command output, absolute paths, file hashes, session data, or private record names. Duplicate names within one source select a deterministic record and mark the source `partial`; duplicates across different sources remain distinct because IDs are source-qualified.

## Privacy and governance

`scanInventorySources` accepts `ProjectConfigV1` and optional governance overrides. The sanitizer enforces:

- `local-only` records are excluded before the snapshot is built.
- `creator-showcase` requires established `origin: creator`.
- absolute user paths, local-file URLs, email addresses, and common secret/token shapes are omitted from public metadata.
- only HTTP(S) source links without embedded credentials are accepted.
- raw local paths, hashes, command output, plugin installation details, Skill bodies, usage evidence, and maintenance state never enter `InventorySnapshotV1`.

Fengxue governance is unchanged: the public records may remain `creator-showcase`, but private Canon, relationship events, Guardian permissions, and memory are outside every scanner input and public snapshot.

## Normalized JSON import

The machine-readable contract is `schemas/source-import.v1.schema.json`:

```json
{
  "schemaVersion": 1,
  "source": {
    "key": "team-skills",
    "label": "Team Skills",
    "providerKind": "folder-export",
    "sourceUrl": "https://example.com/team-skills",
    "updateChannel": "unknown"
  },
  "skills": [
    {
      "name": "research-helper",
      "description": "Builds a source-backed research brief.",
      "trigger": "$research-helper",
      "origin": "third-party",
      "visibility": "public"
    }
  ]
}
```

## Test boundary

The adapter test suite proves:

- identical content under different Windows/macOS/Linux-style paths produces identical output;
- directory, global, plugin, and JSON adapters all emit the same public contract;
- local-only and unsafe metadata cannot enter the snapshot;
- plugin/system/source-managed update channels stay distinct;
- missing and duplicate inputs produce deterministic, path-free diagnostics;
- adapter order cannot change the snapshot;
- the existing 142-Skill renderer and deterministic Public Export remain compatible.

## Intentionally deferred

- `silent-orbit init/scan/import/generate/diff/doctor` user-facing CLI.
- source configuration wizard and automatic provider discovery.
- automatic classification and curated override editor.
- converting InventorySnapshotV1 into a new user's complete LibrarySnapshotV1.
- a user-owned frontend implementation built from the public handoff contract.
- install, update, disable, freeze, remove, watcher, daemon, or browser-to-filesystem control.

Phase 1C now builds the analyzer, review overrides, static renderer, and installable CLI over this scanner boundary; see `docs/architecture/GENERATOR_PHASE1C.md`. The next stages should add the thin Agent Skill wrapper and then run the real external-user Alpha without weakening the review-first privacy boundary.
