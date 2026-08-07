---
name: audit-skill-cosmos
description: Explain a supplied Silent Orbit HealthReportV1 or run a read-only health audit for an existing configured Silent Orbit project, including provider failures, presence, duplicates, identity or version conflicts, update channels, evidence freshness, and unresolved states. Use for project-scoped health interpretation without changing installed Skills or project outputs. Do not use for live global Skill discovery, installs, removals, updates, Web Library or Obsidian drift, or lifecycle reconciliation; those belong to skills-library-maintenance.
---

# Audit Skill Cosmos

Interpret `HealthReportV1` as a thin explanation layer. Let `silent-orbit audit` own provider discovery, normalization, evidence, privacy filtering, and deterministic health logic.

## Resolve the CLI

Use the first available command without downloading anything: a user-supplied
CLI path; the already-installed project-local
`node node_modules/silent-orbit-skills-library/scripts/silent-orbit.mjs`
found between the current directory and workspace root; `silent-orbit` on
`PATH`; the source-repository `node work/agent-os-index/scripts/silent-orbit.mjs`;
or the flat-checkout `node scripts/silent-orbit.mjs`. Verify with `--version`
and require version `0.6.x`. If none exists, report the missing prerequisite
and stop; never invoke an auto-installing `npx` fallback.

## Obtain the report

- If the user supplies a `HealthReportV1`, interpret that report directly.
- Otherwise run `silent-orbit audit --project <directory> --json` against the user-selected Silent Orbit project.
- Add `--stale-after-days <days>` only when the user explicitly supplies the freshness threshold.
- If the CLI or project is unavailable, report the missing prerequisite and stop.
- Do not run `scan`, `analyze`, `diff`, `generate`, or `doctor` on this Skill's behalf.

## Explain only supported evidence

- Separate complete, partial, and failed providers. Keep `source-managed`, `external`, `system-managed`, and `unknown` update channels distinct.
- Explain presence, duplicate identities, identity conflicts, explicit version evidence, evidence freshness, and unresolved codes from the report.
- Treat absent version, dependency, provider, or freshness evidence as `unknown`.
- Call a record `stale` only when the report marks it stale from explicit time or Snapshot evidence under an explicit threshold.
- Never infer that a Skill is the same identity from its name alone. Never claim that everything is updated.
- Trace important conclusions to the report's evidence IDs without exposing raw paths, Skill bodies, hashes, command output, or private artifact contents.

## Keep the read-only boundary

- Never install, update, disable, freeze, remove, restore, or rewrite a real Skill.
- Never edit project configuration, imports, overrides, inventory, receipts, or generated output.
- Never implement or reproduce provider scanning in this Skill.
- Never read usage data, sessions, prompts, Obsidian, or private maintenance ledgers.
- Never push, open a pull request, publish, release, deploy, or change Production.

## Report and suggest

Report the audit status, provider counts and failures, Skill identity and presence counts, duplicates, conflicts, explicit/unknown version counts, freshness states, update channels, and unresolved items. Suggest the smallest next read-only diagnostic step for each unresolved class, but do not execute a repair or mutation.

End by confirming that the audit made no real Skill, project-output, or deployment changes.
