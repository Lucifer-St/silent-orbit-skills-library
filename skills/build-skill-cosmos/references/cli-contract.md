# CLI contract

## Resolve the executable

Use the first available explicit, local, or installed command:

1. A CLI path supplied by the user.
2. `silent-orbit` available on `PATH`.
3. In the Silent Orbit source repository, `node work/agent-os-index/scripts/silent-orbit.mjs`.
4. In a flat public checkout, `node scripts/silent-orbit.mjs`.

Verify with `--version`; require version `0.1.x` for this Skill. Do not download or install a missing CLI.

## Locate the project

Use this order:

1. A project directory explicitly named by the user.
2. The current directory when it contains `silent-orbit.config.json` and `silent-orbit.overrides.json`.
3. A single unambiguous project below the current workspace.
4. A new directory confirmed by the user.

Do not search an entire home directory or guess between multiple projects. Run all project commands with an explicit `--project <directory>` after resolution.

## Invoke commands

Prefer `--json` so the report is grounded in structured output.

```text
silent-orbit init <directory> --title <title> --project-id <portable-id> --json
silent-orbit import --project <directory> --file <source-import.json> --json
silent-orbit scan --project <directory> --json
silent-orbit analyze --project <directory> --json
silent-orbit diff --project <directory> --json
silent-orbit generate --project <directory> --json
silent-orbit doctor --project <directory> --json
```

Use `--generated-at <ISO timestamp>` only for fixtures or reproducibility tests; normal user scans should let the CLI manage the timestamp.

## Interpret outputs

- `scan.report`: use `scannedSources`, `observedItems`, `inventoryItems`, `publishedItems`, `reviewRequired`, `excludedLocalOnly`, `warnings`, and `errors`.
- `snapshot.sources[].scanState`: distinguish `complete`, `partial`, and `failed`.
- `snapshot.diagnostics[]`: report safe `severity`, `code`, and `message`; do not substitute raw provider stderr.
- `analysisReport.summary`: use `inventoryItems`, `included`, `reviewRequired`, `excluded`, and `overridesApplied`.
- `diff.summary`: use `added`, `changed`, and `removed`; the matching arrays contain Skill names.
- `generate.summary`: report generated `skills`, `libraries`, `categories`, and `collections`.
- `doctor.status`: accept `ok`; explain `attention`; treat `error` as blocking.

## Respect command order

Use the normal sequence:

```text
doctor or init -> import/configure -> scan -> analyze -> review -> overrides
-> scan/analyze as needed -> diff -> generate -> doctor
```

`init` refuses to overwrite configuration. `scan` writes only project runtime state and receipts. `generate` validates a temporary output before atomically replacing `dist/`, then advances the diff baseline to the successful Library Snapshot. It also writes `dist/frontend-handoff.md`. None of these commands authorize deployment.
