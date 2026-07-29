# Generator Phase 4: read-only Skill health

Phase 4 adds trustworthy diagnostics before any mutation surface.

## Contracts and command

- `HealthReportV1` is a sanitized, provider-neutral report with evidence IDs, explicit unknown states, provider scan state, update channel, presence, duplicates, identity conflicts, version evidence, freshness, and unresolved codes.
- `silent-orbit audit --json` performs a fresh read-only provider scan and returns the report without writing inventory, receipts, generated files, source data, or installed Skills.
- `silent-orbit doctor` remains the project-integrity command. It validates configuration, generated contracts, and `dist/`; it does not substitute for library health.
- `audit-skill-cosmos` is a two-file explanation wrapper. It contains no scanner, updater, dependency, or mutation implementation.

## Evidence rules

- Treat a version as known only when a provider exposes explicit version metadata.
- Treat identity as conflicting only when explicit author, source URL, or trigger evidence conflicts. A shared name alone never proves identity.
- Keep provider failures partial: a failed source remains visible while successful providers still contribute evidence.
- Mark freshness `stale` only when the audit has an explicit evaluation time, Snapshot time, and caller-supplied `staleAfterDays` threshold. Without that policy, freshness is `unknown`.
- Never infer dependencies, latest versions, update availability, or a global “all updated” state.

## Privacy and authority

Health output may contain only sanitized inventory metadata and evidence derived from it. It excludes absolute paths, hashes, raw Skill bodies, provider command output, usage, sessions, prompts, Obsidian, private ledgers, and local-only records.

Phase 4 cannot install, update, disable, freeze, remove, restore, publish, release, deploy, or change Production. Those operations remain outside this phase.
