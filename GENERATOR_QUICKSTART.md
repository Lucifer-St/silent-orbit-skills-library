# Silent Orbit Public Generator Quickstart

This guide installs the `v0.11.0-beta.4` GitHub Pre-release artifact and creates a minimal reviewed Skill library. The package is not published to the npm registry.

## 1. Download and verify the artifact

Requirements: Node.js 24 and npm.

Download these two assets from the [`v0.11.0-beta.4` Pre-release](https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.11.0-beta.4):

- `silent-orbit-skills-library-0.11.0-beta.4.tgz`
- `SHA256SUMS.txt`

In PowerShell, keep both files in the same directory and verify the tarball before installing it:

```powershell
$expected = (Get-Content -LiteralPath .\SHA256SUMS.txt | Where-Object { $_ -match 'silent-orbit-skills-library-0\.11\.0-beta\.4\.tgz$' }).Split()[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath .\silent-orbit-skills-library-0.11.0-beta.4.tgz).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { throw 'Silent Orbit tarball checksum mismatch.' }
```

## 2. Install the CLI

Project-local installation is the safer default:

```powershell
npm install --save-dev .\silent-orbit-skills-library-0.11.0-beta.4.tgz
npx silent-orbit --version
```

Use a global installation only when you want `silent-orbit` on your user PATH:

```powershell
npm install --global .\silent-orbit-skills-library-0.11.0-beta.4.tgz
silent-orbit --version
```

The package/repository release version is `0.11.0-beta.4`; this source reports the independent CLI interface version `0.4.0` (the `0.4.x` compatibility family). A package patch does not automatically change the CLI interface. Change the CLI version only when commands, arguments, or JSON contracts change.

## 3. Optional Agent Skills

Review every bundled Skill before installing it. `build-skill-cosmos` is the thin generation/review layer; `audit-skill-cosmos` only interprets the read-only health report; `manage-skill-cosmos` explains guarded management plans. These project-level Skills do not independently discover or mutate a real global profile, and none deploys.

```powershell
$skillSource = (Resolve-Path -LiteralPath .\node_modules\silent-orbit-skills-library).Path
Get-Content -LiteralPath (Join-Path $skillSource 'skills\build-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill build-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\audit-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill audit-skill-cosmos --agent codex --copy -y
Get-Content -LiteralPath (Join-Path $skillSource 'skills\manage-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill manage-skill-cosmos --agent codex --copy -y
```

`Resolve-Path` is required on Windows because the Skills installer expects an absolute local source path. Install only the project Skills you need, or omit this step if you only need the CLI.

The release also contains the `skills-library-maintenance` host. A global
handoff replaces an existing named copy, so first compare it with the verified
release and preserve a complete folder backup. If the existing difference is
not traceable to a known release or reviewed source commit, stop.

```powershell
Get-Content -LiteralPath (Join-Path $skillSource 'skills\skills-library-maintenance\SKILL.md')
npx skills add $skillSource --skill skills-library-maintenance --agent codex --global --copy -y
npx skills add $skillSource --skill manage-skill-cosmos --agent codex --global --copy -y
```

The install is not approval to run `npx skills check`, `update`, or `upgrade`;
with the pinned manager those names can mutate matching trusted sources. See
`INSTALLATION_AND_UPGRADE.md` and `RECOVERY.md` for the reviewed handoff.

## 4. First generation

Create a source file named `starter.source-import.json`:

```json
{
  "schemaVersion": 1,
  "source": {
    "key": "starter",
    "label": "Starter Skills",
    "providerKind": "json-import",
    "updateChannel": "unknown"
  },
  "skills": [
    {
      "name": "research-compass",
      "description": "Research public sources and preserve citations.",
      "trigger": "$research-compass",
      "origin": "third-party",
      "visibility": "public"
    }
  ]
}
```

Keeping `visibility: "public"` is an explicit publication decision. Review the metadata first. Use `review-required` when the decision is unresolved, or `local-only` when the record must never enter generated public data.

Run the complete first-use sequence. Replace `npx silent-orbit` with `silent-orbit` if you chose the global installation:

```powershell
npx silent-orbit init .\my-skill-cosmos --title "My Skill Cosmos" --project-id my-skill-cosmos --json
npx silent-orbit import --project .\my-skill-cosmos --file .\starter.source-import.json --json
npx silent-orbit scan --project .\my-skill-cosmos --json
npx silent-orbit analyze --project .\my-skill-cosmos --json
npx silent-orbit diff --project .\my-skill-cosmos --json
npx silent-orbit generate --project .\my-skill-cosmos --json
npx silent-orbit doctor --project .\my-skill-cosmos --json
npx silent-orbit audit --project .\my-skill-cosmos --json
```

Require `doctor.status` to be `ok`. The generated reference site and `frontend-handoff.md` are under `my-skill-cosmos/dist/`. Private imports, analysis, receipts, and runtime state remain under `my-skill-cosmos/.silent-orbit/` and must not be published.

`doctor` checks project integrity. `audit` checks only read-only Skill library health and does not write inventory or receipts. Missing version or freshness evidence stays `unknown`; add `--stale-after-days <days>` only when you intentionally supply that explicit Snapshot-age policy.

## Phase 5C trusted-source maintenance boundary

`silent-orbit manage plan --request <management-request.json> --json` emits a
deterministic plan. `silent-orbit manage apply --plan <management-plan.json>
--dry-run --json` validates it without creating a transaction, backup, receipt,
or target write.

Phase 5C adds host-injected `skills@1.5.20` check-and-update for one reviewed
batch of GitHub source-managed global Skills. The host must capture private
recoverable contents, rescan and diff, synchronize Library/Obsidian, and verify
convergence. Restore occurs only when the manager or verification fails.
Plugin, System, deletion, and unknown-source installation remain separately
gated. The standalone CLI has no host and cannot discover a real global Skill
root. Native update remains direct-write with no native transaction guarantee.

Native update is a trusted external direct-write path. Plans and receipts
explicitly disclose no Core-writer handoff, no independent staging, no native
transaction rollback, and `nativeTransactionGuarantee: false`. Silent Orbit's
selected-Skill snapshot, rescan, verification, and failure-only restore must
not be described as a native manager guarantee. Install, freeze, remove, and
restore remain unsupported by this batch. Runtime plans, roots, locks, backups,
and receipts are private and must never enter Public Export data.

## Release boundary

The Public repository retains a 44-Skill NVIDIA Alpha as a fixed historical acceptance fixture, but it is not part of the installable Generator package and is not Production content. Git-connected Netlify Deploy Previews build that fixture with `npm run build:alpha-preview`. Production continues to build the reviewed 142-Skill projection with `npm run build`; the editable personal inventory and curation remain Private.

Historical Phase 4A/4B labels refer to the **Website Release Track**, not Generator phases. Website Release Phase 4A launched the public beta; Website Release Phase 4B still requires external-human evidence. Generator work uses its own Phase 1A-1E, Phase 2A, and Phase 2B sequence.
