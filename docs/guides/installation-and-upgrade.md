# Installation and upgrade

Silent Orbit `v0.11.0-beta.9` is distributed only through the GitHub
Pre-release. Do not install it by package name from the npm registry.

## Requirements

- Node.js 24 and npm;
- PowerShell for the Windows commands below;
- the downloaded release tarball and `SHA256SUMS.txt`;
- a reviewed destination. Project-local CLI installation is the default.

Follow `generator-quickstart.md` to verify the SHA-256 value and complete a
first generation.

## Install or upgrade the CLI

For a project-local installation:

```powershell
npm install --save-dev .\silent-orbit-skills-library-0.11.0-beta.9.tgz
npx silent-orbit --version
```

For an existing global file-based installation:

```powershell
npm install --global .\silent-orbit-skills-library-0.11.0-beta.9.tgz
silent-orbit --version
```

The expected CLI interface version is `0.4.0`. Back up
`.silent-orbit/` before upgrading a real generated project. Run `doctor` and
`audit` after the upgrade; neither command authorizes a mutation.

## Install or update the bundled global Agent Skills

The tarball contains `skills-library-maintenance` and `manage-skill-cosmos`.
Review their `SKILL.md` files and any existing installed copies before writing.
If the existing copy contains changes that cannot be traced to a known release
or reviewed source commit, stop and reconcile the conflict.

Use beta.6 or newer for this global handoff. Beta.5 did not yet include the
POSIX npm-bin resolution and zero-source diagnostics. Beta.4 retained a package-root
relative Core import after the Skill was copied and is preserved only as
failure evidence; do not use beta.4 to install the global maintenance host.

After installing the tarball in a temporary consumer project:

```powershell
$skillSource = (Resolve-Path -LiteralPath .\node_modules\silent-orbit-skills-library).Path
Get-Content -LiteralPath (Join-Path $skillSource 'skills\skills-library-maintenance\SKILL.md')
Get-Content -LiteralPath (Join-Path $skillSource 'skills\manage-skill-cosmos\SKILL.md')
npx skills@1.5.20 add $skillSource --skill skills-library-maintenance --agent codex --global --copy -y
npx skills@1.5.20 add $skillSource --skill manage-skill-cosmos --agent codex --global --copy -y
$installedMaintenance = Join-Path $HOME '.agents\skills\skills-library-maintenance'
node (Join-Path $installedMaintenance 'scripts\skills-library.mjs') --help
npx skills@1.5.20 list --global --agent codex --json
```

Use an absolute path on Windows. Keep the pre-write folder backup and release
checksum with the private handoff receipt. The install command may replace an
existing named copy; that is why review and backup are required first.

This installation does not authorize `npx skills check`, `update`, or
`upgrade`. With `skills@1.5.20`, those names can enter a direct-write
check-and-update path.

## Post-upgrade checks

1. Re-read the installed `SKILL.md` files.
2. Compare installed folder hashes with the verified release copy.
3. Require the copied maintenance CLI startup above, then run
   `skills-library-maintenance scan` and `plan`.
4. Run project `doctor`, `audit`, and a deterministic sample generation.
5. Keep deletion, freeze, Plugin/System mutation, and unknown-source mutation
   blocked.

See `recovery.md`, `../policies/privacy.md`, and `../policies/versioning-and-migrations.md` before a
real maintenance run.
