# Contributing

Thank you for taking the time to improve Silent Orbit Skills Library.

## Before opening a change

- Keep the public/private release boundary intact.
- Do not add private paths, personal outcomes, accounts, sessions, usage evidence, local maintenance state, or third-party Skill instruction files.
- Do not add visual assets without provenance and a clear license boundary.
- Keep generated files deterministic; edit source files rather than `dist/`, QA output, or browser profiles.

Public contributions may change the versioned Core, future Schemas, read-only
Source Adapters, analyzer, CLI, the thin bundled Agent Skills, operational
documentation, or `reference-index` renderer. Personal inventory, curation,
Outcomes, usage evidence, Obsidian content, maintenance ledgers, dogfood
projects, backups, and real run receipts belong to the Private repository and
must not be contributed here.

The checked-in catalog and browser data are sanitized generated projections used to reproduce the public site. They are not a second authoring source. Propose catalog corrections through the Private curation/Export workflow; do not hand-edit a drifting public copy.

## Local verification

Use Node.js 24. Browser smoke and visual QA currently require Windows with Google Chrome installed.

```powershell
npm ci
npm run validate:data
npm run validate:assets
npm run validate:public-repository
npm run validate:readme
npm run test:mvp
npx tsc --noEmit
npm run build
npm run smoke:ui
npm run qa:visual
```

Explain what changed, why it matters, and which checks passed. Keep feature work, dependency updates, and data changes in separate pull requests when practical.

Run `npm run test:boundary` for every ownership or package-surface change. Release, deployment, and generated-catalog updates require separate authorization after review; an accepted Core contribution does not itself authorize publishing or Netlify changes.

## Schema and migration changes

Released `*.v1.schema.json` files are frozen by
`schemas/schema-lock.v1.json`. Do not edit a v1 Schema or its lock digest. A
contract change requires a new versioned Schema family, deterministic dry-run
migration, pre-write backup, validation receipt, and old/new fixtures. Update
`VERSIONING_AND_MIGRATIONS.md`, both Quickstarts, and release notes in the same
PR.

The release gate must recompute the Schema lock and pass from a clean checkout.
Generated RC files are outputs; never hand-patch them to make a migration pass.

## Package and CLI versions

The package/repository release version and CLI interface version are
independent. For the current source, the package is `0.11.0-beta.4` while
`silent-orbit --version` reports `0.4.0`. Apply the SemVer and deprecation
policy in `VERSIONING_AND_MIGRATIONS.md`; document every compatibility change
in release notes.

## Catalog contributions

Public Skill records may contain factual identity, source URL, provider, classification, invocation, and a short project-curated summary. Do not copy a third-party `SKILL.md` or other long instruction text without explicit permission.

## Visual contributions

Project visuals are excluded from the MIT License. A contribution must document its origin, source, license boundary, dimensions, SHA-256 value, and intended product role before it can enter the public asset manifest.
