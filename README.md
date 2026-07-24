<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Silent Orbit Skills Library — a local-first bilingual atlas for AI capabilities">
</p>

<p align="center">
  <a href="https://silent-orbit-skills-library.netlify.app/">Live demo</a> ·
  <a href="./README.zh-CN.md">中文说明</a> ·
  <a href="https://github.com/Lucifer-St/silent-orbit-skills-library/actions/workflows/public-release-gate.yml">CI</a> ·
  <a href="./LICENSE">MIT code license</a>
</p>

Silent Orbit turns a growing AI Skills collection into a navigable product: search by intent, move from **System → Library → Skill**, inspect provenance and boundaries, and record outcomes without sending personal data to a backend.

The public catalog currently contains **142 Skills across 9 systems and 28 libraries**.

## Install the Public Generator

The Public Generator is distributed only as the verified GitHub Pre-release tarball; it is not published to the npm registry. Follow the [Generator Quickstart](./GENERATOR_QUICKSTART.md) to verify the artifact, install the CLI from the downloaded file, optionally install the bundled project Skills, and complete a reviewed first generation. The same release contains `skills-library-maintenance` and `manage-skill-cosmos` for a backed-up, conflict-reviewed global handoff. Phase 5C supports one host-injected, reviewed `skills@1.5.20` check-and-update batch with private recovery, rescan, Library/Obsidian sync, and verification. The standalone CLI host remains empty; Plugin, System, deletion, freeze, and unknown-source mutation stay separately gated, and native update has no transaction guarantee.

## Phase 1E Alpha Preview

The Draft PR also builds a separate **44-Skill Reference Preview** from a pinned independent environment. It keeps the interactive Skill map as a primary way to explore the collection: a white canvas, black relationship lines, category clusters, restrained pan/zoom, and spatial focus transitions. A compact Library view uses the same search, filters, selection, and URL state.

This Reference Renderer is a functional starting point, not an official visual theme. Generated projects include `frontend-handoff.md` so users can retain the public data, keyboard behavior, deep links, and privacy boundary while rebuilding the interface with any visual style and frontend Skill they prefer.

- [Phase 1E architecture and acceptance boundary](./docs/architecture/GENERATOR_PHASE1E.md)
- [Phase 2B dogfood and source-of-truth boundary](./docs/architecture/GENERATOR_PHASE2B.md)
- [Install and first-use guide](./GENERATOR_QUICKSTART.md)
- The Alpha receipt explicitly records `humanFeedback: false`; it proves a fixed independent environment, not external-user feedback.
- Production remains the reviewed 142-Skill site. The Alpha is historical acceptance evidence, not a second catalog source or Production replacement.

## See the library

<p align="center">
  <img src="./assets/readme/home.png" width="100%" alt="Silent Orbit home screen with nine functional systems arranged across a monochrome galaxy">
</p>

Start with a task, not a package name. Try **“Install and verify a new Codex Skill”** or **“安装并验证一个新的 Codex Skill”** in the live demo, then open the matching Skill to inspect when to use it, where it comes from, and what remains local.

<table>
  <tr>
    <td width="50%"><img src="./assets/readme/catalog.png" alt="Function catalog showing nine systems and their library counts"></td>
    <td width="50%"><img src="./assets/readme/inspector.png" alt="Skill inspector showing purpose, source, invocation, and public boundary"></td>
  </tr>
  <tr>
    <td align="center"><sub>Browse by functional system</sub></td>
    <td align="center"><sub>Inspect source and usage boundaries</sub></td>
  </tr>
</table>

<p align="center">
  <img src="./assets/readme/mobile-inspector.png" width="360" alt="Skill inspector on a narrow mobile viewport">
</p>

## What it does

- **Searches bilingually by intent.** Chinese and English metadata share one deterministic local index.
- **Makes a large catalog legible.** The visual hierarchy separates functional systems, source libraries, and individual Skills.
- **Shows provenance before trust.** Public detail records distinguish creator showcases from third-party sources.
- **Keeps outcomes local.** Outcome records use the visitor's browser storage; the static app has no backend synchronization path.
- **Exports deterministically.** A strict allowlist, manifest, hashes, privacy checks, tests, browser smoke, and visual QA produce the public release candidate.

## How it works

<p align="center">
  <img src="./assets/readme/architecture.svg" width="100%" alt="Silent Orbit public data, deterministic export, static application, and browser-local outcome architecture">
</p>

The Private development repository remains the authority for personal inventory, curation, Outcomes, usage evidence, Obsidian integration, and operating receipts. Public owns the versioned Core, Schemas, CLI, Agent Skill, Quickstarts, and reference renderer. Catalog files in this repository are deterministic sanitized projections, not a second authoring source; visitor outcomes never enter the export pipeline.

## Privacy boundary

- Only `public` and `creator-showcase` catalog records are published.
- Personal memory, local paths, accounts, sessions, usage evidence, private maintenance state, and knowledge-base content are excluded.
- Third-party Skill instruction files are not redistributed; the catalog carries factual metadata, source links, and project-curated summaries.
- Source maps and unapproved legacy visual candidates are rejected by the release validator.

`fengxue` and `fengxue-ai-weekly` remain intentionally visible as creator showcases. Their public records contain only public-facing identity, capability, invocation, and output descriptions.

## Run locally

Requirements: Node.js 24 and a Windows machine with Google Chrome for browser smoke and visual QA.

```powershell
npm ci
npm run dev
```

The development server runs locally. The production build is written to `dist/`.

## Public beta

- [Beta testing guide](./BETA_TESTING.md)
- [Beta feedback template](./BETA_FEEDBACK_TEMPLATE.md)
- GitHub issue forms are available for reproducible bugs and experience feedback.

The public beta uses no third-party analytics, cookies, or behavior tracking. Safari remains an external beta coverage item.

## Operational handoff

- [Installation and upgrade](./INSTALLATION_AND_UPGRADE.md)
- [Versioning, compatibility, migrations, and deprecation](./VERSIONING_AND_MIGRATIONS.md)
- [Privacy policy and data boundary](./PRIVACY.md)
- [Recovery and rollback](./RECOVERY.md)
- [Security policy](./SECURITY.md)
- [Contribution policy](./CONTRIBUTING.md)

The `v0.11.0-beta.4` v1 Schemas are locked by
`schemas/schema-lock.v1.json`. This is a GitHub Pre-release, not `v1.0.0`, and
Production authority remains Public `main` after the required `release-gate`.

## Verify the release

```powershell
npm run validate:data
npm run validate:assets
npm run validate:public-repository
npm run validate:readme
npm run test:mvp
npx tsc --noEmit
npm run build
npm run build:alpha-preview
npm run smoke:ui
npm run qa:visual
```

GitHub Actions runs the same full gate on `windows-latest`. The manifest and privacy validator reject payload drift, private paths, secret-like material, untracked public assets, and prohibited source files.

## Limits and licensing

- This is a static discovery and outcome-tracking product, not an agent orchestrator or remote Skill runner.
- Browser-local outcomes do not sync across devices or origins.
- Application code is licensed under MIT.
- Project-created and project-generated visuals are excluded from MIT; see [`ASSET_LICENSE.md`](./ASSET_LICENSE.md).
- Fonts and dependencies retain their original licenses; see [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and [`ASSET_PROVENANCE.json`](./ASSET_PROVENANCE.json).

Security reports, privacy, recovery, versioning, and contribution boundaries
are documented in the operational handoff above.
