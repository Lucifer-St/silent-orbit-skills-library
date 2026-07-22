# Project and schema contract

Treat the CLI's bundled JSON Schemas as authoritative. Edit only the documented fields and let `scan`, `analyze`, and `doctor` validate them.

## Project files

```text
<project>/
├─ silent-orbit.config.json
├─ silent-orbit.overrides.json
├─ .silent-orbit/                 # private runtime; ignored by Git
├─ library.snapshot.json          # reviewed public model
├─ site-manifest.json             # public generation manifest
└─ dist/                          # local Map + Library reference preview
   └─ frontend-handoff.md         # public-safe handoff to a frontend Skill
```

Never publish `.silent-orbit/`. It may contain imports, private Inventory, analysis reports, previous snapshots, transactions, and receipts.

## Source configuration

`silent-orbit.config.json` is version 1 and contains `project` plus `sources`.

```json
{
  "schemaVersion": 1,
  "project": {
    "schemaVersion": 1,
    "projectId": "my-skill-cosmos",
    "title": { "en-US": "My Skill Cosmos" },
    "locales": ["en-US"],
    "defaultLocale": "en-US",
    "renderer": { "theme": "reference-index", "defaultRoute": "/" },
    "privacy": {
      "defaultVisibility": "review-required",
      "publicVisibilities": ["public", "creator-showcase"],
      "publishRawPaths": false,
      "publishHashes": false,
      "publishUsageEvidence": false
    }
  },
  "sources": [
    {
      "key": "team-skills",
      "type": "skill-folder",
      "label": "Team Skills",
      "path": "../team-skills",
      "updateChannel": "unknown",
      "maxDepth": 4
    }
  ]
}
```

Supported source types are `skill-folder`, `codex-global`, `codex-plugin`, and `json-import`. Every source needs a portable unique `key` and non-empty `label`. All except `codex-global` need `path`. Optional `sourceUrl` must be public HTTP(S); `maxDepth` is 0–20. Source paths are read-only inputs and may be outside the project.

Projects use `reference-index`, the portable interactive Map plus dense Library preview. The former author-only `silent-orbit` renderer compatibility path was retired after the 142/28/9 dogfood and rollback gates passed. The renderer identifier is not a theme recommendation; use the generated frontend handoff when the user wants a custom visual implementation.

Use `silent-orbit import` instead of hand-copying normalized JSON. A `SourceImportV1` has `schemaVersion`, `source`, and `skills`; each Skill may include public metadata plus `state`, `origin`, and `visibility`.

## Override configuration

`silent-orbit.overrides.json` is version 1 and contains:

- `taxonomy`: review category plus functional categories and matching terms;
- `governance`: publication/origin decisions keyed by `sourceKey` and Skill `name`;
- `skillOverrides`: curated description, trigger, categories, and primary category;
- `libraryOverrides`: source display metadata;
- `collections`: curated or personal-deck Skill selectors.

Example confirmed decisions:

```json
{
  "sourceKey": "team-skills",
  "name": "research-helper",
  "origin": "third-party",
  "visibility": "public"
}
```

```json
{
  "selector": { "sourceKey": "team-skills", "name": "research-helper" },
  "categoryKeys": ["research-knowledge"],
  "primaryCategoryKey": "research-knowledge"
}
```

Use source-qualified selectors whenever names may collide. `primaryCategoryKey` must appear in `categoryKeys`. Do not add local paths, emails, tokens, raw Skill bodies, usage evidence, or private maintenance data to overrides.

## Visibility and origin

- `public`: allowed into the public Library snapshot after review.
- `creator-showcase`: allowed only with established `origin: creator`.
- `review-required`: retained privately for review and excluded from the site.
- `local-only`: excluded before Inventory publication.

Valid origins are `third-party`, `creator`, `system`, and `unknown`. Never infer creator authorship from a folder or library name.
