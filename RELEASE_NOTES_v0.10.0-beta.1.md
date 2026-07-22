# Silent Orbit v0.10.0-beta.1 — Read-only Skill Health

Silent Orbit is a local-first bilingual atlas and open-source toolkit for discovering, navigating, generating, and auditing AI Skill libraries.

## Live Demo

https://silent-orbit-skills-library.netlify.app/

## What is new

- `silent-orbit audit --json` reports only Skill-library health; `doctor` remains the separate project-integrity check.
- `HealthReportV1` records Provider scan state, source failures, presence, duplicates, identity conflicts, explicit version evidence, update channels, freshness evidence, and unresolved states.
- Freshness stays `unknown` unless an explicit Snapshot time, evaluation time, and stale threshold support a stale/current conclusion.
- Missing version evidence stays `unknown`; the CLI does not guess dependencies, versions, or an "all up to date" result.
- The bundled `audit-skill-cosmos` Agent Skill is a thin interpreter of the CLI report. It contains no scanner or mutation logic.

## Included foundation

- The `silent-orbit` CLI, `build-skill-cosmos`, and `audit-skill-cosmos`, with a verified tarball install path and bilingual Quickstart.
- Deterministic English and Chinese search across 142 public-safe Skill records.
- System → Library → Skill navigation, Catalog exploration, Skill Inspector, keyboard and reduced-motion support, and narrow-screen layouts.
- Browser-local History and Outcome records that are never uploaded by the static site.
- Public-safe creator showcases for `fengxue` and `fengxue-ai-weekly`.

The catalog remains 142 Skills, 9 functional Systems, and 28 Libraries.

Version boundary: `0.10.0-beta.1` is the website/repository/package release version. The bundled executable reports the independent CLI interface version `0.2.0`; these versions advance separately.

The 44-Skill NVIDIA Alpha remains a fixed independent acceptance fixture and Deploy Preview path. Git-connected Production continues to build the reviewed 142-Skill Silent Orbit catalog.

See [Generator Quickstart](./GENERATOR_QUICKSTART.md) for artifact verification, installation, generation, `doctor`, and read-only `audit` checks.

## Governance and privacy

Only `public` and `creator-showcase` records are shipped. Reports and public output exclude absolute paths, raw provider bodies, secrets, usage/session evidence, maintenance ledgers, private memories, relationship events, Guardian permissions, and Canon text. The audit path never installs, updates, disables, freezes, or deletes real Skills.

The website uses no third-party analytics, cookies, or behavior tracking. Production authority remains Public GitHub `main`; direct Private-source or manual Netlify Production deploys are prohibited.

## Quality gates

The tagged commit must pass the required Public `release-gate`, deterministic export comparison, fresh-install data/assets/privacy validation, full tests, TypeScript, production build, browser smoke, and the 22-state visual QA matrix. The Deploy Preview must preserve the 142/28/9 catalog, Silent Orbit visuals, and zero browser console/runtime errors before merge.

## Known limitations

- Version and freshness health remain `unknown` when Providers do not supply explicit evidence. This is intentional, not an audit failure.
- Safari remains external beta coverage; this release does not fabricate real-user or Safari results.
- This beta does not include guarded Skill mutation, accounts, cloud sync, analytics, Collections, or Constellations.

## Feedback

- [Beta testing guide](./BETA_TESTING.md)
- [Beta feedback template](./BETA_FEEDBACK_TEMPLATE.md)
- Open a Bug Report for P0–P2 defects.
- Open Experience Feedback for confusion, delight, and future ideas.

## Assets and licenses

Application code is MIT licensed. Project-created and generated visual assets are excluded from MIT under `ASSET_LICENSE.md`. Fonts and dependencies retain their original licenses; see `THIRD_PARTY_NOTICES.md` and `ASSET_PROVENANCE.json`.
