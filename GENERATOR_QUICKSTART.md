# Silent Orbit Public Generator Quickstart

This guide installs the `v0.9.0-beta.1` GitHub Pre-release artifact and creates a minimal reviewed Skill library. The package is not published to the npm registry.

## 1. Download and verify the artifact

Requirements: Node.js 24 and npm.

Download these two assets from the [`v0.9.0-beta.1` Pre-release](https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.9.0-beta.1):

- `silent-orbit-skills-library-0.9.0-beta.1.tgz`
- `SHA256SUMS.txt`

In PowerShell, keep both files in the same directory and verify the tarball before installing it:

```powershell
$expected = (Get-Content -LiteralPath .\SHA256SUMS.txt | Where-Object { $_ -match 'silent-orbit-skills-library-0\.9\.0-beta\.1\.tgz$' }).Split()[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath .\silent-orbit-skills-library-0.9.0-beta.1.tgz).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { throw 'Silent Orbit tarball checksum mismatch.' }
```

## 2. Install the CLI

Project-local installation is the safer default:

```powershell
npm install --save-dev .\silent-orbit-skills-library-0.9.0-beta.1.tgz
npx silent-orbit --version
```

Use a global installation only when you want `silent-orbit` on your user PATH:

```powershell
npm install --global .\silent-orbit-skills-library-0.9.0-beta.1.tgz
silent-orbit --version
```

The package version is `0.9.0-beta.1`; the generator CLI reports its independent `0.1.x` interface version.

## 3. Optional project-level Agent Skill

Review the bundled Skill before installing it. The Skill is a thin CLI and publication-review layer; it does not install, update, remove, or rewrite real Skills and it does not deploy.

```powershell
$skillSource = (Resolve-Path -LiteralPath .\node_modules\silent-orbit-skills-library).Path
Get-Content -LiteralPath (Join-Path $skillSource 'skills\build-skill-cosmos\SKILL.md')
npx skills add $skillSource --skill build-skill-cosmos --agent codex --copy -y
```

`Resolve-Path` is required on Windows because the Skills installer expects an absolute local source path. This installs `build-skill-cosmos` for the current project. Omit this step if you only need the CLI.

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
```

Require `doctor.status` to be `ok`. The generated reference site and `frontend-handoff.md` are under `my-skill-cosmos/dist/`. Private imports, analysis, receipts, and runtime state remain under `my-skill-cosmos/.silent-orbit/` and must not be published.

## Release boundary

The bundled 44-Skill NVIDIA Alpha is a fixed acceptance fixture. It proves an independent install and generation path; it is not Production content. Git-connected Netlify Deploy Previews build that fixture with `npm run build:alpha-preview`, while merged Production continues to build the current 142-Skill Silent Orbit catalog with `npm run build`.
