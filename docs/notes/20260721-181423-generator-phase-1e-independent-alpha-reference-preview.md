# Generator Phase 1E: independent Alpha and reference preview

Status: implemented on `codex/generator-phase1e`
Input: Generator Phase 1D (`silent-orbit` CLI plus `build-skill-cosmos`)

## Purpose

Phase 1E proves that an installed Generator package can create and update a Skill library from an environment that is independent of the original 142-Skill catalog. The acceptance is reproducible and intentionally records `humanFeedback: false`; it is an environment test, not a claim of real second-user feedback.

The existing Production website remains the compatible 142-Skill release. The Phase 1E public branch adds a Draft PR and Git-connected Deploy Preview only.

## Independent environment

The Alpha source is pinned to `NVIDIA/skills@f1f4c7a8bff9676ffa73a7874b6e5e27aa4ee3a0`. A canonical relative-path scan selects the first 49 valid, portable, non-duplicate metadata records into a content-addressed source lock.

- V1 observes ranks 1-48.
- Ranks 1-44 are explicitly reviewed as `third-party/public`.
- Ranks 45-46 remain `review-required`.
- Ranks 47-48 are `local-only`.
- V2 removes rank 10, adds and reviews rank 49, and changes the public metadata/category of ranks 5, 15, and 25.

Both V1 and V2 therefore record 48 observed Skills, 46 sanitized Inventory records, 44 public Library records, 2 review-required records, and 2 local-only exclusions. The V2 pre-generation diff must be exactly one addition, three changes, and one removal. A successful generation advances the diff baseline, after which the diff is empty.

The committed public Alpha projection contains only the 44 reviewed metadata records, a sanitized source lock, public handoff, and `Phase1EAlphaReceiptV1`. It never contains third-party Skill instruction bodies, private fixture inputs, raw provider output, local paths, tokens, email addresses, or excluded record names.

## Reference Renderer

`reference-index` is the default Renderer for new projects. Its Phase 1E presentation is named **Editorial Skill Atlas**. It remains a functional reference, not an official Silent Orbit art direction or a bundled theme roadmap.

The Preview interprets the editorial hierarchy, monochrome palette, hairlines, square geometry, and restrained blue focus language documented in [VoltAgent's WIRED design-system reference](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/wired/DESIGN.md). It does not copy that publication's name, logo, page composition, or content.

The Renderer exposes two views over the same public `SiteManifestV1`:

- **Map**: an editorial taxonomy spread. The overview composes Category chapters with sparse black relationships rather than 44 radial edges; focusing a Category reorganizes its Skills into readable columns or a mobile sequence while retaining pan, zoom, focus, and return.
- **Library**: a magazine-style index that prioritizes full Skill names and descriptions while keeping Category and Source metadata quiet. Desktop pairs the index with a 420–480px article Detail panel; mobile uses a filter sheet, one-column results, and full-screen Detail.

Map and Library share search, Category and Source filters, selection, URL state, browser history, keyboard navigation, empty states, and result counts. The Preview self-hosts Playfair Display, Lora, and Inter under the SIL Open Font License; `#057DBC` is reserved for links and focus. It uses white, black, hairlines, zero-radius controls, reduced-motion support, and no gradients, shadows, decorative hero, pixel art, SaaS cards, or publication branding.

Every generated site includes `frontend-handoff.md`. Users are encouraged to keep the public data and interaction/privacy obligations while implementing any visual language they prefer with their own frontend Skill. The Generator does not maintain a roadmap of bundled art themes.

## Release boundary

The Phase 1E flow is:

```text
Private source
  -> deterministic Public Export
  -> Public GitHub Draft PR
  -> release-gate
  -> Git-connected Netlify Deploy Preview
```

Phase 1E stops at Preview. It does not merge the PR, change public `main`, replace Production, create a release or tag, publish npm, or directly deploy Private source to Netlify.

## Completion evidence

The Alpha receipt records source provenance, lock digest, V1/V2 snapshot and output digests, exact diff names, privacy results, legacy compatibility counts, release-gate state, Deploy Preview state, and `productionChanged: false`.

Phase 1 is complete when any user can use the read-only, privacy-first CLI and universal Agent Skill to generate and update a reviewed Skill library, explore it through Map or Library, and hand the public data to any frontend Skill without modifying installed Skills.
