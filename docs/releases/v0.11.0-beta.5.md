# Silent Orbit v0.11.0-beta.5 — Standalone maintenance handoff

`v0.11.0-beta.5` is the Phase 6A corrective Release Candidate. It preserves
the accepted `0.11.x` contracts while fixing the installed
`skills-library-maintenance` handoff discovered during beta.4 dogfood.

## Corrective change

- The trusted-source maintenance Core now lives inside the bundled
  `skills-library-maintenance` Skill.
- The copied global Skill and the Public CLI are generated from that same
  canonical file.
- A copied Skill can start outside the package tree without resolving a
  package-root-relative `work/agent-os-index/...` import.
- Export tests require the Public CLI Core and bundled Skill Core to be
  byte-identical and execute the Skill from an isolated copied profile.
- The release lock refreshes transitive `postcss` to `8.5.23`, clearing
  `GHSA-r28c-9q8g-f849`; the release gate reports zero npm audit findings.
- The beta.4 Tag, Release, and assets remain immutable historical evidence of
  the failed handoff candidate.

## Compatibility

- Package/repository candidate: `0.11.0-beta.5`.
- CLI interface: unchanged at `0.4.0`.
- JSON contract family: unchanged at `v1`.
- Every locked v1 Schema digest is unchanged from beta.4.
- No migration is required.
- This is not `v1.0.0`, and it is not published to the npm registry.

## Supported boundary

The supported mutation remains one host-injected, reviewed GitHub
source-managed `skills@1.5.20` check-and-update batch with private recovery,
rescan, Library/Obsidian synchronization, and convergence verification.
Deletion, freeze, Plugin mutation, System mutation, and unknown-source
mutation remain blocked or separately gated.

## Release gate

The candidate must pass complete Private tests, a real isolated copied-Skill
startup, pinned-manager disposable integration, deterministic Public Export
comparison, fresh Public RC validation, TypeScript, production build, browser
smoke, visual QA, privacy validation, `npm pack`, release-asset re-download,
global Skill backup/install verification, and installed-package dogfood.

Publication uses only:

`Private source -> deterministic Public Export -> Public PR -> release-gate -> Public main -> existing Git-connected Netlify Production`

No direct Netlify deploy is authorized.
