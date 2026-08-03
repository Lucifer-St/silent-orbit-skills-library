# CLI contract

## Resolve the executable

Use the first available explicit, local, or installed command:

1. A CLI path supplied by the user.
2. `silent-orbit` available on `PATH`.
3. In the Silent Orbit source repository,
   `node work/agent-os-index/scripts/silent-orbit.mjs`.
4. In a flat public checkout, `node scripts/silent-orbit.mjs`.

The published `v0.12.0-beta.1` CLI remains `0.5.x`. The additive newcomer
prerelease `v0.13.0-beta.1` requires CLI `0.6.x`; never relabel or rewrite the
historical tag. Verify with `--version`, then run:

```text
silent-orbit capabilities --contract v3 --json
```

Require:

- `capabilities.customization.state: supported`
- `capabilities.customization.contractFamily: v2-sidecar+experience-v3`
- `capabilities.customization.directionCount: 2`
- `capabilities.customization.refreshSafe: true`
- `capabilities.customization.preferredViewBinding: true`
- `capabilities.customization.structureDigest: true`

Do not infer CLI compatibility from the repository/package tag.

## Locate the project

Use a user-named directory, the current directory when it contains both
Silent Orbit config files, or a single unambiguous project below the current
workspace. Do not search a whole home directory or guess between projects.

Run all project commands with explicit `--project <directory>`.

## Commands

```text
silent-orbit customize preflight --project <directory> --json
silent-orbit customize setup --project <directory> --confirm <exact-token> --json
silent-orbit customize interview start --project <directory> --json
silent-orbit customize interview status --project <directory> --json
silent-orbit customize interview answer --project <directory> --answer <natural-language> --json
silent-orbit customize interview back --project <directory> --json
silent-orbit customize interview review --project <directory> [--advanced] --json
silent-orbit customize interview confirm --project <directory> --json
silent-orbit customize prepare --project <directory> --from-interview --json
silent-orbit customize status --project <directory> --json
silent-orbit customize doctor --project <directory> --json
silent-orbit customize prepare --project <directory> --request <prepare.json> --json
silent-orbit customize decide --project <directory> --request <decision.json> --json
silent-orbit customize respond --project <directory> --request <response.json> --json
silent-orbit customize refresh --project <directory> --json
```

`preflight` must produce no writes. `setup` accepts only the exact token shown
by that preflight and may create only the named project onboarding sidecar.
Do not translate setup into `npm -g`, a package-manager global install, system
configuration, or an unrelated directory scan.

The default beginner path is the persisted `interview` sequence followed by
`prepare --from-interview`; raw answer text must not be saved. The request-file
form remains an advanced compatibility path and must not be used as a fixture
shortcut in newcomer acceptance.

`prepare` is for the first round only. Existing work continues through
`decide adjust` or `decide redo` so history cannot be lost.

Use explicit `generatedAt` fields in request JSON. Normal refresh may let the
CLI choose the current time; fixtures should pass `--generated-at`.

## Interpret outputs

- `CustomizationPrepareResultV2.directions`: exactly two functional previews.
- `CustomizationExperienceV3.preferredView`: the confirmed default; explicit
  URL/runtime view is a separate choice.
- `CustomizationExperienceV3.structureDigest`: public-data-only structure
  identity; redesign must change it and a CSS-only diff must fail.
- `CustomizationDecisionResultV2.current`: present only after `keep`.
- `CustomizationRefreshResultV2.stylePreserved`: must be `true`.
- `CustomizationDoctorV2.status`: require `ok` for completion; `attention`
  means a decision or refresh is still needed; `error` is blocking.

Do not expose private receipt contents, absolute project paths, hashes, or raw
request files in the user-facing report.
