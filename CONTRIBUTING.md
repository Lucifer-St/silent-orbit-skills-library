# Contributing

Thank you for taking the time to improve Silent Orbit Skills Library.

## Before opening a change

- Keep the public/private release boundary intact.
- Do not add private paths, personal outcomes, accounts, sessions, usage evidence, local maintenance state, or third-party Skill instruction files.
- Do not add visual assets without provenance and a clear license boundary.
- Keep generated files deterministic; edit source files rather than `dist/`, QA output, or browser profiles.

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

## Catalog contributions

Public Skill records may contain factual identity, source URL, provider, classification, invocation, and a short project-curated summary. Do not copy a third-party `SKILL.md` or other long instruction text without explicit permission.

## Visual contributions

Project visuals are excluded from the MIT License. A contribution must document its origin, source, license boundary, dimensions, SHA-256 value, and intended product role before it can enter the public asset manifest.
