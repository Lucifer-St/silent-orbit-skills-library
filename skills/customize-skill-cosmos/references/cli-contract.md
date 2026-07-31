# CLI contract

## Resolve the executable

Use the first available explicit, local, or installed command:

1. A CLI path supplied by the user.
2. `silent-orbit` available on `PATH`.
3. In the Silent Orbit source repository,
   `node work/agent-os-index/scripts/silent-orbit.mjs`.
4. In a flat public checkout, `node scripts/silent-orbit.mjs`.

Verify with `--version`; require version `0.5.x`. Then run:

```text
silent-orbit capabilities --json
```

Require:

- `capabilities.customization.state: supported`
- `capabilities.customization.contractFamily: v2-sidecar`
- `capabilities.customization.directionCount: 2`
- `capabilities.customization.refreshSafe: true`

Do not infer CLI compatibility from the repository/package tag.

## Locate the project

Use a user-named directory, the current directory when it contains both
Silent Orbit config files, or a single unambiguous project below the current
workspace. Do not search a whole home directory or guess between projects.

Run all project commands with explicit `--project <directory>`.

## Commands

```text
silent-orbit customize status --project <directory> --json
silent-orbit customize doctor --project <directory> --json
silent-orbit customize prepare --project <directory> --request <prepare.json> --json
silent-orbit customize decide --project <directory> --request <decision.json> --json
silent-orbit customize refresh --project <directory> --json
```

`prepare` is for the first round only. Existing work continues through
`decide adjust` or `decide redo` so history cannot be lost.

Use explicit `generatedAt` fields in request JSON. Normal refresh may let the
CLI choose the current time; fixtures should pass `--generated-at`.

## Interpret outputs

- `CustomizationPrepareResultV2.directions`: exactly two functional previews.
- `CustomizationDecisionResultV2.current`: present only after `keep`.
- `CustomizationRefreshResultV2.stylePreserved`: must be `true`.
- `CustomizationDoctorV2.status`: require `ok` for completion; `attention`
  means a decision or refresh is still needed; `error` is blocking.

Do not expose private receipt contents, absolute project paths, hashes, or raw
request files in the user-facing report.
