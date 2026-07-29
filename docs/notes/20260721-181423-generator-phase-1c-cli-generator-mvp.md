# Generator Phase 1C: CLI Generator MVP

Status: implemented on `codex/generator-phase1c`
Input contracts: Generator Phase 1A and the read-only adapters from Phase 1B

## Purpose

Phase 1C turns the versioned contracts and adapters into an installable `silent-orbit` command. It creates a local project, records explicit sources, scans without mutating those sources, exposes review decisions, and generates a deterministic static Skill library.

This phase does not install, update, disable, remove, or publish Skills. It does not deploy to GitHub or Netlify. The real second-user Alpha and the thin Agent Skill wrapper remain later acceptance stages.

## Commands

```text
silent-orbit init [directory]
silent-orbit import --file source-import.json
silent-orbit scan
silent-orbit analyze
silent-orbit diff
silent-orbit generate
silent-orbit doctor
```

- `init` creates a portable project configuration, review overrides, private runtime directory, and ignore rule.
- `import` validates and stores one normalized `SourceImportV1` inside the private runtime directory, then adds it to the configured sources.
- `scan` runs the Phase 1B adapters and writes a sanitized private Inventory snapshot. It never changes installed Skills.
- `analyze` applies transparent keyword rules and explicit overrides, writes the review report, and projects only approved records into `LibrarySnapshotV1`.
- `diff` compares the current Library snapshot with the last replaced snapshot using stable Skill ids.
- `generate` validates every contract, builds a complete static library in a temporary directory, validates privacy and references, then atomically replaces `dist` and writes a receipt.
- `doctor` checks configuration, source availability, snapshots, and generated output without repairing or mutating sources.

## Project files

```text
my-skill-library/
├─ silent-orbit.config.json
├─ silent-orbit.overrides.json
├─ .gitignore
├─ .silent-orbit/                 # ignored private runtime
│  ├─ imports/
│  ├─ inventory.private.json
│  ├─ analysis-report.json
│  ├─ previous-snapshot.json
│  └─ receipts/
├─ library.snapshot.json
├─ site-manifest.json
└─ dist/
```

The CLI has a fixed write boundary: all generated files must resolve below the selected project root. Configured source paths are read-only inputs and are never copied into public snapshots or the site.

## Review-first governance

New CLI projects use `review-required` as their default visibility. Scanning an unfamiliar directory therefore does not silently publish its records.

A Skill enters `LibrarySnapshotV1` only when:

1. the source import explicitly marks it `public` or `creator-showcase`; or
2. `silent-orbit.overrides.json` contains an explicit governance decision.

`creator-showcase` still requires established `origin: creator`. `local-only` records are removed before Inventory output. `review-required` records remain in the private Inventory and analysis report but are not copied into the public Library snapshot or generated site.

## Analyzer and overrides

The analyzer uses a visible taxonomy with plain keyword terms. A unique rule result is marked `inferred-rule`; a tie or no match is routed to the visible `Review Required` category. A user override is marked `curated-override`. Inference is never relabeled as observed or curated fact.

The override contract can:

- approve or withhold publication;
- establish creator origin;
- curate description and trigger metadata;
- assign one or more functional categories;
- rename a source library for display;
- define curated or personal collections.

Every override selects a stable source plus Skill name. Ambiguous same-name records must be source-qualified.

## Determinism and replacement

The first scan receives an explicit or current timestamp. A later unchanged scan reuses the previous timestamp, so its Inventory id and bytes remain stable. Every later artifact derives its timestamp from that Inventory snapshot.

Generation uses:

```text
temporary directory -> contract validation -> privacy scan -> file digest -> atomic replacement -> receipt
```

Repeated generation from the same Inventory and overrides produces the same `dist` file list, sizes, and SHA-256 digests. Receipts remain private under `.silent-orbit/receipts`.

## Installable package boundary

The repository package exposes `scripts/silent-orbit.mjs` as the `silent-orbit` binary and has an explicit npm file allowlist. The CLI runtime uses Node built-ins only; the packaged command does not depend on the private outer repository, Obsidian, Git, Netlify, or the current 142-Skill dataset.

## Acceptance boundary

Phase 1C is complete when a fresh temporary directory can run:

```text
init -> import or configured scan -> analyze -> diff -> generate -> doctor
```

and prove:

- the source environment was not modified;
- unreviewed and local-only records were not published;
- the generated site contains no local paths, secret-like values, raw Skill bodies, or usage evidence;
- consecutive scans and generations are deterministic for unchanged inputs;
- replacement and receipts stay inside the project root;
- the packed CLI runs after installation in an unrelated temporary directory;
- the existing 142-Skill renderer and deterministic Public Export remain unchanged.

The thin `build-skill-cosmos` Agent Skill is implemented in Phase 1D. Phase 1E now validates the installed package against a fixed independent Skill environment and publishes only the reviewed Alpha projection.
