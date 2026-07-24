# Silent Orbit v0.11.0-beta.4 — Trusted-source Maintenance

Silent Orbit remains a local-first bilingual atlas and open-source toolkit for
discovering, generating, auditing, and carefully maintaining AI Skill
libraries.

## What is new

- Phase 5C adds host-injected `skills@1.5.20` check-and-update for one reviewed
  GitHub source-managed global Skill batch.
- The manager is content-addressed by package version, registry integrity,
  package metadata SHA-256, and CLI bundle SHA-256.
- One exact batch approval replaces one token per trusted Skill.
- Before execution, the host stores private names, source identities, folder
  hashes, exact lock bytes, and recoverable selected-Skill contents.
- After execution, the shared Core rescans, reports the hash diff, synchronizes
  Library/Obsidian through an atomic host callback, and verifies convergence.
- Manager or verification failure restores exact before folders and lock
  hashes. Successful runs retain the private snapshot without restoring it.
- `check-and-update` is canonical; `check-updates` and source-managed `update`
  are compatibility aliases to the same Core.
- `manage-skill-cosmos` and the sanitized, separately installed
  `skills-library-maintenance` host share that Core. The standalone CLI still
  has no real-profile host.
- Phase 6A publishes the sanitized `skills-library-maintenance` Agent Skill in
  the verified tarball so an operator can install it and
  `manage-skill-cosmos` from the same reviewed Release.
- A machine-verified v1 Schema lock, SemVer/compatibility and deprecation
  policy, installation/upgrade guide, privacy policy, recovery guide, expanded
  security policy, and contribution migration rules complete the operational
  handoff.

## Trusted external manager boundary

Native `skills@1.5.20 check`, `update`, and `upgrade` share a direct-write
mutation path. Silent Orbit records `nativeTransactionGuarantee: false`; the
outer snapshot, rescan, verification, and failure-only restore are not a
native manager transaction guarantee.

Legacy GitHub source-managed entries without a lock folder hash are still
snapshotted and named in the private plan as `lockFolderHashUnavailable`. The
pinned manager can still check and update them. Silent Orbit binds its own
computed pre-run folder hash into the reviewed batch and claims an update only
when the post-run diff proves one.

Plugin mutation, System Skill mutation, deletion, and unknown-source
installation remain outside the batch policy and require their own blocker or
approval.

## Public privacy boundary

The deterministic Public Export may contain reusable Core code, contracts,
sanitized capability evidence, synthetic/disposable tests, architecture
documentation, and thin Agent Skill instructions. It excludes absolute
runtime paths, selected names and sources from a real run, locks, backups,
recoverable Skill contents, raw manager output, receipts, private usage, and
Obsidian state.

## Included foundation

- Package candidate `0.11.0-beta.4` and CLI interface `0.4.0`.
- The `silent-orbit` CLI plus `build-skill-cosmos`, `audit-skill-cosmos`, and
  `manage-skill-cosmos`.
- Deterministic generation, read-only health, guarded management contracts,
  and the reviewed 142-Skill public projection.

## Quality gate

The candidate must pass the actual pinned-manager disposable integration,
manager/verification failure recovery, complete Private tests, deterministic
Public Export comparison, fresh Public RC validation, TypeScript, production
build, browser smoke, visual QA, Agent Skill validation, privacy checks, and
`npm pack`.

The release is published only through deterministic Public Export, Public PR,
required `release-gate`, Public `main`, and the existing Git-connected Netlify
site. It is a GitHub Pre-release, not `v1.0.0`, and is not published to the npm
registry. No direct Netlify deploy is part of the release.

## Known limitations

- Native manager writes are not database transactions.
- Recovery is limited to the reviewed source-managed Skill folders and exact
  manager lock; unrelated profile state is not copied.
- The real batch still depends on upstream source availability and integrity.
- The standalone CLI cannot discover a real profile.
- Safari remains external beta coverage.
- The released maintenance host still requires an explicit local repository
  configuration and retains private runtime evidence outside the package and
  Public Export.

## Assets and licenses

Application code is MIT licensed. Project-created and generated visual assets
remain excluded from MIT under `ASSET_LICENSE.md`. Fonts and dependencies keep
their original licenses.
