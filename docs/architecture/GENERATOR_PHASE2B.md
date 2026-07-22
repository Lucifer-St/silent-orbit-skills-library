# Generator Phase 2B: dogfooding and source-of-truth boundary

Status: implemented locally; no publication or deployment action is implied.

Phase 2B proves that the released Generator can rebuild the current reviewed Silent Orbit catalog without relying on the source checkout CLI, then uses that proof to retire the author-only compatibility surface from the Public Core.

## Dogfood gate

The acceptance runner uses the exact `v0.9.0-beta.1` GitHub Release tarball:

- package: `silent-orbit-skills-library@0.9.0-beta.1`;
- tarball SHA-256: `2607e3e96b06e868f8a87ac304d3d63982b5a7708a4decc7d03ac566d450025a`;
- CLI interface: `silent-orbit 0.1.0`;
- installation: project-local inside the ignored `.dogfood/phase2b/consumer`;
- command entry: the installed package under `node_modules`, never `scripts/silent-orbit.mjs` from the source checkout.

`build-skill-cosmos` remains the review and reporting layer. The installed CLI owns import, scan, analysis, diff, generation, privacy checks, atomic output replacement, and doctor checks.

The Private source projection is read-only. It produces 28 normalized source imports plus reviewed taxonomy, governance, library, category, and collection overrides inside the ignored dogfood project. It never installs, updates, disables, removes, or rewrites a real Skill.

## Required parity

The gate is deeper than a count check. It requires:

- 142 reviewed public or creator-showcase Skills;
- 28 Libraries and exact Skill membership by Library title;
- 9 functional categories and exact membership sets;
- exact public name, description, trigger, status, origin, visibility, and Library title for every Skill;
- zero review-required records, local-only output, warnings, errors, additions after generation, unexplained removals, or failed sources;
- `doctor.status = ok`.

If live source counts or membership drift, the runner reports drift and stops. It never repairs, deletes, or modifies the source automatically.

## Reversible two-round workflow

The ignored project runs:

1. Baseline `scan -> analyze -> diff -> generate -> doctor`, followed by an empty post-generate diff.
2. A metadata-only update to one copied import, then the same command chain and another empty post-generate diff.
3. A rollback gate that restores the original copied import, reruns the chain, and requires the baseline output digest to return exactly.
4. One unchanged repeat generation that must keep the restored digest.

The fixed `--generated-at` value is allowed here because this is a reproducibility fixture. Ordinary user projects continue to use CLI-managed timestamps.

## Source-of-truth boundary

| Surface | Authority | Allowed content |
| --- | --- | --- |
| Public Core/package | Public | versioned contracts, Schemas, read-only Source Adapters, analyzer, CLI, `build-skill-cosmos`, Quickstarts, and `reference-index` renderer |
| Public repository projection | Generated from Private | sanitized reviewed catalog and static build inputs needed to reproduce the published site; these are outputs, not authoring sources |
| Private repository | Private | personal inventory, Library/category curation, Outcomes and personal deck metadata, usage evidence, Obsidian integration, maintenance state, dogfood inputs, receipts, and operating history |
| Browser runtime | Visitor-local | Outcome records in `localStorage`; never part of Public Export or Private dogfood inputs |

Public generated projections must never be hand-edited as a second source of truth. Changes start in the appropriate Public Core contract or Private curated source, then flow through tests and deterministic export.

## Compatibility retirement

The former `createLegacyGeneratorModel` API and the CLI's `silent-orbit-v1` renderer option were author-only migration surfaces. They were removed from Public Core only after the tarball parity and rollback gates passed.

Private still owns a production projection from the curated nine-file source because those files contain the current personal catalog and sanitized site curation. That projection is intentionally isolated in `phase2b-private-library.mjs`, excluded from the installable package and Public script allowlist. A flat Public checkout consumes generated `ProjectConfigV1`, `InventorySnapshotV1`, `LibrarySnapshotV1`, and `SiteManifestV1` contract files instead.

## Version and phase names

These versions are independent:

- `0.9.0-beta.1` is the website/repository/package release version and Git tag.
- `0.1.0` is the CLI interface contract reported by `silent-orbit --version`.

A package patch or beta release does not automatically change the CLI interface. Change the CLI version only when its command or JSON contract changes, and document compatibility in the release notes.

Historical references to Phase 4A and Phase 4B belong to the **Website Release Track**:

- Website Release Phase 4A: production hardening and public beta launch, complete.
- Website Release Phase 4B: external-human beta, still evidence-dependent.

They are not Generator Phase 4A/4B and must not be used to number Generator work. The Generator track is Phase 1A-1E followed by Phase 2A release and Phase 2B dogfooding/boundary work.

## Public contribution flow

1. Change only Public-owned Core, Schemas, CLI, Agent Skill, Quickstarts, or reference renderer behavior.
2. Add focused contract and boundary tests. Never add personal inventory, raw Skill bodies, usage/session data, local paths, Obsidian content, or run receipts.
3. Run public Core tests, CLI/Agent Skill tests, boundary tests, Public Export twice, and Public repository gates.
4. Submit the Public change through its normal branch, review, and required checks. Do not hand-edit generated catalog projections.
5. Release or deploy only under a separately authorized release task.

## Private upgrade flow

1. Verify the desired Public release/tag and package/CLI compatibility.
2. Download and checksum the published tarball into an ignored dogfood directory.
3. Run the Phase 2B dogfood gate against the current Private catalog. Report live drift without automatic mutation.
4. Review all additions, changes, and removals. Update Private inventory or curation only through the Private maintenance workflow and its explicit deletion gates.
5. Regenerate the deterministic Public projection, validate it twice, and inspect the exact diff.
6. Push, PR, publish, or deploy only when a later task explicitly authorizes those actions.

## Non-actions

Phase 2B does not modify real Skills, Obsidian, Public GitHub, an existing Release, or Netlify. It does not push, create a PR, publish, or deploy. Production remains the released 142/28/9 catalog.
