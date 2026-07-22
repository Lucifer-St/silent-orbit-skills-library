# Generator Phase 1A: contract and compatibility boundary

Status: implemented on `codex/generator-phase1a`
Input baseline: completed Phase 4A private source

## Purpose

Phase 1A turns the current author-specific data build into a versioned contract boundary without yet implementing a generic scanner or CLI. The existing nine JSON inputs remain supported as a legacy source, but the renderer is now generated through four explicit v1 contracts:

1. `ProjectConfigV1` defines project, locale, renderer, and privacy policy.
2. `InventorySnapshotV1` represents sanitized observed Skill and source inventory.
3. `LibrarySnapshotV1` contains normalized catalog entities, category memberships, collections, and field provenance.
4. `SiteManifestV1` binds exact snapshots to one renderer build and exposes derived summaries.

The machine-readable JSON Schemas live in `schemas/`. Runtime validation and the legacy adapter live in `scripts/lib/generator-contracts.mjs`. TypeScript renderer contracts live in `src/core/contracts.ts`.

## Compatibility flow

```text
legacy nine-file data
  -> public/local-only governance filter
  -> ProjectConfigV1 + InventorySnapshotV1 + LibrarySnapshotV1
  -> SiteManifestV1
  -> RendererViewModel
  -> existing React application
```

The current React screens still receive the familiar `AppData` shape. That shape is no longer assembled directly from nine independent files: it is projected from `LibrarySnapshotV1`. This keeps current Outcome schema v1, routing, search, Orbit, Catalog, personal deck, and release scripts compatible while later Scanner and CLI work can replace only the legacy input adapter.

## Single category/count authority

The previous build had two definitions of a category:

- Orbit and navigation read the stored `category-units.json.skill_count`.
- Catalog calculated the union of unit membership and `skill.category` at runtime.

Phase 1A converts both legacy signals into explicit `categoryMemberships`. A Skill may have multiple category memberships, and every renderer category count is derived from the unique member IDs. `LibrarySnapshotV1` intentionally has no `skill_count` field.

The migrated public counts are now consistent on every surface:

| Category order | Legacy stored | Derived v1 |
|---:|---:|---:|
| 1 | 7 | 10 |
| 2 | 12 | 22 |
| 3 | 62 | 69 |
| 4 | 1 | 3 |
| 5 | 3 | 12 |
| 6 | 18 | 20 |
| 7 | 6 | 7 |
| 8 | 2 | 4 |
| 9 | 28 | 33 |

The total catalog remains 142 unique Skills. Category counts are membership counts and therefore are not expected to sum to 142.

## Identity and provenance

- New Skill IDs are deterministic and source-qualified. They do not depend on absolute filesystem paths.
- Legacy Skill names remain available as display names and Outcome IDs during this compatibility stage.
- Every normalized Skill separates `observed`, `inferred`, and `curated` fields.
- Collections such as Personal Deck store Skill IDs rather than duplicate Skill records.

## Privacy and publication boundary

- Sanitized inventory and library snapshots reject `local-only` records.
- Raw paths, hashes, sessions, usage evidence, Obsidian data, and maintenance runtime state are not contract inputs.
- `fengxue` and `fengxue-ai-weekly` remain `creator-showcase`; no private Canon, relationship events, Guardian permissions, or local memory are copied.
- The production chain remains Private source -> deterministic Public Export -> Public GitHub `main` -> `release-gate` -> Netlify. Phase 1A does not deploy.

## Intentionally deferred

- Real filesystem and provider scanning.
- `silent-orbit init/scan/generate/diff/doctor` CLI commands.
- User-authored config wizard and overrides.
- Theme extraction or visual redesign.
- Install, update, disable, remove, watcher, or daemon behavior.

Phase 1B implements the read-only adapters, Phase 1C adds the review-first CLI Generator, Phase 1D adds the thin Agent Skill, and Phase 1E validates a fixed independent environment plus Reference Preview. The hosted renderer contract remains compatible, while the Alpha receipt explicitly avoids claiming real external-user feedback.
