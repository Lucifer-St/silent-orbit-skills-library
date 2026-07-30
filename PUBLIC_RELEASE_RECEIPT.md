# Public Release completion receipt

- Public Release status: GO
- Input commit: `8034b0b1b1b77022439c01465a4486f31faa915c`
- Input commit timestamp: `2026-07-30T05:21:04-04:00`
- Canonical release digest: `bdad80b32eab4046b95fa0f4c03764ae7b3dc903c3125fd69de51dba270120c8`
- JSON manifest SHA-256: `d553e1eb90bddddcf2cae32dd62bf51198943baef84aba1309fd54d874e9bbde`
- Markdown manifest SHA-256: `f8ef8ddf32c8ec482a29c584f9d2920c8674e6875041a248ef9a95d34e3589ab`
- Payload: 304 files / 12214334 bytes
- Production bundles: `index-BkobVKMl.css`, `index-DQJPEK8T.js`

## Fresh-RC verification

- `npm ci`: PASS, pinned dependency install
- `npm run validate:data`: PASS
- `npm run validate:assets`: PASS
- `npm run validate:public-release`: PASS before and after build/QA
- `npm run test:mvp`: PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `npm run smoke:ui`: PASS, zero browser console/runtime errors
- `npm run qa:visual`: PASS, 22/22 desktop/mobile states

## Release boundary

- Export boundary: allowlisted current snapshot only; no Private Git history
- Repository visibility, default branch, branch protection, PR, merge, and tag actions: none
- Netlify site, configuration, and deploy actions: none
- Private maintenance, Obsidian, and usage-write actions: none

This deterministic receipt is written only after every fresh-RC gate exits successfully.
