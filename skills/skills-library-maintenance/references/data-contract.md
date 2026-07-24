# Data contract

## Private runtime files

Store these under `<repo>/.skills-library-maintenance/`, which must remain Git-ignored:

- `snapshots/inventory-latest.json`: exact global Skill paths, hashes, plugin output, and scan evidence.
- `plans/plan-latest.json`: additions, removals, unchanged records, and unresolved decisions.
- `catalog/private-skills.json`: private lifecycle ledger for all newly managed records, including installed paths and hashes for public records plus active and retired `local-only` records. The legacy file name is retained for compatibility.
- `usage/YYYY-MM.json`: exact private monthly aggregates.
- `transactions/<id>/`: backup manifest and pre-write file copies.
- `trusted-source-maintenance/<id>/snapshot.json`: private batch identity,
  manager identity, Skill names, source identities, before hashes, and
  recovery status.
- `trusted-source-maintenance/<id>/contents/`: recoverable copies of only the
  reviewed trusted source-managed Skill folders.
- `trusted-source-maintenance/<id>/skill-lock.before.json`: exact private lock
  recovery bytes.
- `trusted-source-maintenance/<id>/receipt.json`: manager result, before/after
  diff, synchronization verification, and failure-only recovery result.

These trusted-source files remain private and Git-ignored. Public status may
expose only sanitized counts, channel state, and snapshot date.

## Public catalog fields

Retain the existing stable Skill name and independent governance axes:

- `origin`: `third-party | creator | system | unknown`
- `visibility`: `public | creator-showcase | local-only`
- `library_key`: organization only; never authorship or permission

The versioned source catalog contains only `public` and `creator-showcase` records. New records default to `public`; only an explicit privacy opt-out creates `local-only`. Keep installed paths, hashes, raw evidence, and every `local-only` record exclusively in private runtime state and Obsidian. The generated application and `public/data` must still reject `local-only` records and all dangling Library, category, starred, relation, detail, and personal-deck references as defense in depth.

## Lifecycle event

Use a stable event id and record:

```json
{
  "id": "skill-name-2026-07-17-installed",
  "date": "2026-07-17",
  "type": "published",
  "skill": "skill-name",
  "visibility": "public",
  "title_i18n": { "zh-CN": "...", "en-US": "..." },
  "summary_i18n": { "zh-CN": "...", "en-US": "..." }
}
```

Every private event also receives a stable id. Local-only lifecycle events stay private. Public `changes.json` may contain sanitized publication and update events for public records; confirmed removal deletes their active references and appends a bilingual public tombstone. Public events never include paths, hashes, raw command output, or private usage.

## Update status

Use channel states rather than a single global boolean:

- `current`: checked and no update reported
- `update-available`: a source-managed update is reported
- `unchecked`: no reliable check ran
- `external`: plugin workflow owns the update
- `system-managed`: Codex/runtime owns the update
- `error`: check failed; include details privately only

## Monthly usage

Store one record per Skill with:

- `task_count`: unique task/turn evidence count
- `last_seen_at`: latest evidence timestamp
- `evidence_types`: `explicit-invocation | skill-file-read`
- `confidence`: `high | medium`

Never store prompt text in the aggregate. Never copy the private usage JSON into website source, generated application data, or `public/data`.

## Public publication handoff

The sanitized public maintenance status must declare the Production authority without exposing credentials or local state:

- `productionAuthority`: `public-github-main`
- `publicRepository`: the designated public repository slug
- `requiredCheck`: `release-gate`
- `deployProvider`: `netlify`
- `directPrivateProductionDeploy`: `false`

This is a public safety contract, not a deploy credential. Private paths, site tokens, provider installation IDs, and rollback state remain outside public data.
