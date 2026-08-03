# Silent Orbit v1 RC independent acceptance (15–25 minutes)

Use only the [`v0.13.0-beta.1` GitHub Pre-release](https://github.com/Lucifer-St/silent-orbit-skills-library/releases/tag/v0.13.0-beta.1).
That one page is the authoritative handoff. Do not accept a local path, an
unpublished archive, or a separately sent PowerShell bundle.

This checklist must be completed by a real independent user. Author dogfood,
fixtures, CI, automated agents, download counts, and a previous partial
conversation are not external acceptance.

## 1. Download and verify (2 minutes)

Download these Release assets:

- `silent-orbit-skills-library-0.13.0-beta.1.tgz`
- `SHA256SUMS.txt`
- `silent-orbit-v1-starter.source-import.json`
- `v1-docker-smoke.sh` and `codex-global.config.json` when testing Docker

Windows PowerShell:

```powershell
$tarball = 'silent-orbit-skills-library-0.13.0-beta.1.tgz'
$matches = @(Get-Content -LiteralPath .\SHA256SUMS.txt | Where-Object { $_ -match '^(?<hash>[0-9A-Fa-f]{64})\s+\*?silent-orbit-skills-library-0\.13\.0-beta\.1\.tgz$' })
if ($matches.Count -ne 1) { throw "Expected exactly one checksum entry for $tarball." }
$expected = ([regex]::Match($matches[0], '^[0-9A-Fa-f]{64}').Value).ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ".\$tarball").Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "Checksum mismatch" }
```

Linux:

```sh
tarball='silent-orbit-skills-library-0.13.0-beta.1.tgz'
checksum_line="$(awk -v name="$tarball" '$2 == name || $2 == "*" name { print }' SHA256SUMS.txt)"
match_count="$(printf '%s\n' "$checksum_line" | awk 'NF { count += 1 } END { print count + 0 }')"
[ "$match_count" -eq 1 ] || { echo "Expected exactly one checksum entry for $tarball." >&2; exit 1; }
printf '%s\n' "$checksum_line" | sha256sum --check -
```

macOS:

```sh
tarball='silent-orbit-skills-library-0.13.0-beta.1.tgz'
checksum_line="$(awk -v name="$tarball" '$2 == name || $2 == "*" name { print }' SHA256SUMS.txt)"
match_count="$(printf '%s\n' "$checksum_line" | awk 'NF { count += 1 } END { print count + 0 }')"
[ "$match_count" -eq 1 ] || { echo "Expected exactly one checksum entry for $tarball." >&2; exit 1; }
expected="$(printf '%s\n' "$checksum_line" | awk '{ print tolower($1) }')"
actual="$(shasum -a 256 "$tarball" | awk '{ print tolower($1) }')"
[ "$actual" = "$expected" ] || { echo 'Checksum mismatch.' >&2; exit 1; }
printf 'Checksum passed: %s\n' "$actual"
```

These commands select only the exact tarball entry, so optional Release assets
do not have to be downloaded merely to verify the tarball. Stop on a missing,
duplicate, or mismatched entry.

## 2. Install with Node.js 24 (3 minutes)

In a new empty directory:

```sh
npm init -y
npm install ./silent-orbit-skills-library-0.13.0-beta.1.tgz
npx silent-orbit --version
```

Expected CLI version: `0.6.0`. The package version and CLI interface version
are intentionally independent. The package is not published to npm.

## 3. Doctor before data exists (1 minute)

```sh
npx silent-orbit init ./my-skill-cosmos --title "My Skill Cosmos" --project-id my-skill-cosmos --json
npx silent-orbit doctor --project ./my-skill-cosmos --json
```

An initial `attention` result that names missing generated files is expected.
A crash, private author path, or unexplained empty result is a failure.

## 4. First generation and audit (5 minutes)

```sh
npx silent-orbit import --project ./my-skill-cosmos --file ./silent-orbit-v1-starter.source-import.json --json
npx silent-orbit scan --project ./my-skill-cosmos --json
npx silent-orbit analyze --project ./my-skill-cosmos --json
npx silent-orbit diff --project ./my-skill-cosmos --json
npx silent-orbit generate --project ./my-skill-cosmos --json
npx silent-orbit doctor --project ./my-skill-cosmos --json
npx silent-orbit audit --project ./my-skill-cosmos --json
```

Expected: one controlled Skill is found; generate succeeds; final doctor is
`ok`; audit has zero source failures. `attention` is acceptable for the
starter source's intentionally unknown update/freshness evidence.

## 5. Second scan/diff stability check (2 minutes)

```sh
npx silent-orbit scan --project ./my-skill-cosmos --json
npx silent-orbit analyze --project ./my-skill-cosmos --json
npx silent-orbit diff --project ./my-skill-cosmos --json
```

Expected final summary: `added: 0`, `changed: 0`, `removed: 0`.

## 6. Docker boundary, when Docker is part of your environment (4 minutes)

Run both Release-provided Docker smoke scenarios. The unmounted scenario must
find zero Skills **and** explain that the host `.agents/skills` directory must
be mounted. The mounted scenario must discover at least one Skill with zero
errors. A silent zero-source success is a P1 failure.

From the Release asset directory on macOS or Linux:

```sh
docker run --rm -e HOME=/tmp/home -e SILENT_ORBIT_SCENARIO=unmounted \
  --mount type=bind,src="$PWD/silent-orbit-skills-library-0.13.0-beta.1.tgz",dst=/input/release.tgz,readonly \
  --mount type=bind,src="$PWD/codex-global.config.json",dst=/fixture/codex-global.config.json,readonly \
  --mount type=bind,src="$PWD/v1-docker-smoke.sh",dst=/runner/v1-docker-smoke.sh,readonly \
  node:24-bookworm-slim sh /runner/v1-docker-smoke.sh

docker run --rm -e HOME=/tmp/home -e SILENT_ORBIT_SCENARIO=mounted \
  --mount type=bind,src="$PWD/silent-orbit-skills-library-0.13.0-beta.1.tgz",dst=/input/release.tgz,readonly \
  --mount type=bind,src="$PWD/codex-global.config.json",dst=/fixture/codex-global.config.json,readonly \
  --mount type=bind,src="$PWD/v1-docker-smoke.sh",dst=/runner/v1-docker-smoke.sh,readonly \
  --mount type=bind,src="$HOME/.agents",dst=/tmp/home/.agents,readonly \
  node:24-bookworm-slim sh /runner/v1-docker-smoke.sh
```

On Windows PowerShell, use the same two commands with absolute bind sources:

```powershell
$assets = (Get-Location).Path
$agents = Join-Path $env:USERPROFILE ".agents"
docker run --rm -e HOME=/tmp/home -e SILENT_ORBIT_SCENARIO=unmounted `
  --mount "type=bind,src=$assets\silent-orbit-skills-library-0.13.0-beta.1.tgz,dst=/input/release.tgz,readonly" `
  --mount "type=bind,src=$assets\codex-global.config.json,dst=/fixture/codex-global.config.json,readonly" `
  --mount "type=bind,src=$assets\v1-docker-smoke.sh,dst=/runner/v1-docker-smoke.sh,readonly" `
  node:24-bookworm-slim sh /runner/v1-docker-smoke.sh
docker run --rm -e HOME=/tmp/home -e SILENT_ORBIT_SCENARIO=mounted `
  --mount "type=bind,src=$assets\silent-orbit-skills-library-0.13.0-beta.1.tgz,dst=/input/release.tgz,readonly" `
  --mount "type=bind,src=$assets\codex-global.config.json,dst=/fixture/codex-global.config.json,readonly" `
  --mount "type=bind,src=$assets\v1-docker-smoke.sh,dst=/runner/v1-docker-smoke.sh,readonly" `
  --mount "type=bind,src=$agents,dst=/tmp/home/.agents,readonly" `
  node:24-bookworm-slim sh /runner/v1-docker-smoke.sh
```

Docker never gains access to host Skills automatically. Native Windows, Linux,
and macOS are supported with Node.js 24; Docker requires an explicit mount.
The hosted website only browses the public catalog and cannot change local
Skills.

## 7. Create the privacy-safe receipt (1 minute)

```sh
node ./node_modules/silent-orbit-skills-library/scripts/create-v1-acceptance-summary.mjs \
  --project ./my-skill-cosmos \
  --docker-unmounted not-tested \
  --docker-mounted not-tested \
  --trusted-maintenance not-run \
  --out ./silent-orbit-v1-acceptance-receipt.json
```

Use `pass` instead of `not-tested` for each Docker scenario you completed.
The receipt includes only OS family, architecture, Node major, public versions,
check states, and aggregate counts. It excludes absolute paths, Skill names,
prompts, raw logs, and local records. Review it before submitting.

## 8. Controlled trusted-source maintenance, only after all core checks pass (3–7 minutes)

This step is a real mutation. `npx skills@1.5.20 check` is check-and-update,
not read-only. Review the proposed trusted GitHub source-managed batch, capture
a lightweight recovery snapshot, give explicit approval for that batch, run
the pinned manager once, then rescan and report the before/after Skill names,
source identities, hashes, and recovery reference privately.

Do not delete, freeze, install from an unknown source, mutate a Plugin/System
Skill, or expose local paths and raw locks. If you do not consent to the
reviewed mutation, report `not-run`; that is not a full Phase 6B acceptance.
After the reviewed batch and rescan, create the receipt again with
`--trusted-maintenance pass`.

## 9. Submit the original result (2 minutes)

Open the repository's **V1 RC External Acceptance** Issue Form from the same
GitHub Release page. Paste the privacy-safe receipt and report every P0/P1,
including a failure that you later worked around. Do not paste raw logs,
machine paths, private prompts, memories, or account data.

A private copy sent to the maintainer is only for privacy triage or
troubleshooting; it is not Phase 6B evidence. To complete Phase 6B, the
independent user who performed the checks must personally submit the Issue
Form.

`v1.0.0` remains NO-GO until a genuinely independent result completes this
whole flow with no unresolved P0/P1.
