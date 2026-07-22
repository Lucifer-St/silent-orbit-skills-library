---
name: audit-skill-cosmos
description: Explain a Silent Orbit read-only Skill library health audit, including provider failures, presence, duplicates, identity or version conflicts, update channels, evidence freshness, and unresolved states, then suggest safe next diagnostic steps. Use when a user asks to audit, check, interpret, or troubleshoot the health of a configured Skill cosmos/library without changing installed Skills or project outputs.
---

# Audit Skill Cosmos

Interpret `HealthReportV1` as a thin explanation layer. Let `silent-orbit audit` own provider discovery, normalization, evidence, privacy filtering, and deterministic health logic.

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
