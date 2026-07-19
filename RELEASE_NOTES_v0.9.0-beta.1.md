# Silent Orbit v0.9.0-beta.1 — Public Beta

Silent Orbit is a local-first bilingual atlas for discovering, navigating, and governing AI Skills across Systems and Libraries.

## Live Demo

https://silent-orbit-skills-library.netlify.app/

## What is included

- Deterministic English and Chinese search across 142 public-safe Skill records.
- System → Library → Skill navigation, Catalog exploration, and a detailed Skill Inspector.
- A one-bit interactive orbit view with keyboard, reduced-motion, and narrow-screen support.
- Browser-local History and Outcome records that are never uploaded by this static site.
- Public-safe creator showcases for `fengxue` and `fengxue-ai-weekly`.

The final catalog contains 142 Skills, 9 functional Systems, and 28 Libraries.

## Governance and privacy

Only `public` and `creator-showcase` records are shipped. Creator-showcase records contain public identity and capability summaries, not private memories, relationship events, Guardian permissions, local paths, sessions, usage evidence, or maintenance ledgers. The website uses no third-party analytics, cookies, or behavior tracking.

## Quality gates

The tagged commit is required to pass the public `release-gate`, fresh-install data and asset validation, domain tests, TypeScript, production build, browser smoke, and visual QA. Phase 4A also checks production metadata, canonical/OG/Twitter tags, robots, sitemap, favicon, security headers, SPA fallback, local storage, mobile behavior, and Lighthouse thresholds before the tag is published.

Phase 4A release-candidate results:

- Lighthouse desktop: Performance 98, Accessibility 100, Best Practices 100, SEO 100.
- Lighthouse mobile: Performance 74, Accessibility 100, Best Practices 100, SEO 100.
- Core-path browser checks: Chrome/Chromium, Edge, Firefox, and a 390 × 844 narrow mobile viewport.
- Browser console/runtime errors: zero in the checked core paths.
- Safari: explicitly pending external beta coverage.

## Known limitations

- Safari requires external beta coverage; Phase 4A does not claim a local Safari pass.
- This beta does not include Collections, Constellations, accounts, cloud sync, analytics, or cross-device Outcome storage.
- External beta feedback is Phase 4B work and is not represented as completed here.

## Feedback

- [Beta testing guide](./BETA_TESTING.md)
- [Beta feedback template](./BETA_FEEDBACK_TEMPLATE.md)
- Open a Bug Report for P0–P2 defects.
- Open Experience Feedback for confusion, delight, and future ideas.

## Assets and licenses

Application code is MIT licensed. Project-created and generated visual assets are excluded from MIT under `ASSET_LICENSE.md`. Fonts and dependencies retain their original licenses; see `THIRD_PARTY_NOTICES.md` and `ASSET_PROVENANCE.json`.
