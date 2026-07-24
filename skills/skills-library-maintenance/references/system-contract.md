# System contract

## Surfaces

The maintenance system observes three independent capability surfaces:

| Surface | Discovery | Update path | Execution policy |
|---|---|---|---|
| Source-managed global Skills | `npx skills list -g -a codex --json` | pinned `skills@1.5.20 check <reviewed names> -g -y` (check-and-update) | May execute for one approved trusted GitHub batch |
| Plugin-provided Skills | `codex plugin list` plus installed plugin manifests | Plugin/marketplace workflow | Report in v1; do not bulk mutate |
| System Skills | bundled runtime manifests | Codex/runtime update | Report as system-managed |

Do not flatten these channels into a single misleading "all up to date" result.

## Transaction order

1. Capture the live-before snapshot.
2. Compare against the public catalog and private local catalog.
3. Write a plan containing additions, removals, metadata changes, and unresolved items.
4. Obtain confirmation for destructive actions. Publication follows the standing default-public policy unless the current request explicitly opts out.
5. Create pre-write backups for every affected catalog and Vault file, then replace each target atomically.
6. Regenerate the public application data and run repository validation.
7. On any failure, restore every backup and regenerate from the restored source; otherwise seal the rollback manifest.
8. Run a second live scan and require convergence when no confirmation remains pending.
9. For public changes, commit and push the current Private maintenance branch, then generate and validate the deterministic sanitized Public Export. Publication continues only through the designated Public repository PR, required `release-gate`, Public `main`, and the connected existing Netlify site.

## Install policy

- Install only through the confirmed source supplied by the user.
- Verify the resulting global surface before synchronizing.
- Record the actual installed path and content hash privately.
- Add new records as `public` by default, using only sanitized catalog metadata in versioned and Public Export outputs.
- Use `local-only` only when the current request explicitly says private, local-only, do not publish, or no public release.
- If installation changes multiple Skills, plan every addition separately.

## Removal policy

- Resolve the exact active Skill and scope before showing confirmation.
- Never accept an ambiguous substring as a removal target.
- After confirmation, run the removal command and verify absence.
- Retain a tombstone with stable name, last source, removed time, reason, and previous visibility.
- Remove the Skill from active category and Library membership only after live verification.
- A pending disappearance returns a distinct non-zero exit code so wrappers cannot mistake it for convergence.
- If the Skill reappears, reactivate the same record instead of creating a second identity and apply the current default-public policy unless an explicit privacy exception is present.

## Update policy

- Native `skills check` means check-and-update. It is not read-only.
- One explicit approval may cover a reviewed batch of trusted GitHub
  source-managed Skills.
- `check-and-update` is canonical. `check-updates` and source-managed `update`
  are compatibility aliases backed by the same Core, not separate mutation
  paths.
- Pin the external manager version and capture a lightweight private snapshot
  of source identities, folder hashes, and recoverable installed contents.
- Verify the package lock integrity, package metadata digest, and CLI bundle
  digest before preview and again before execution.
- Re-scan after the command and report every changed, added, missing, or failed
  Skill. Restore the snapshot when the command or verification fails.
- This recovery layer is not represented as a native transaction guarantee.
- A successful run retains its private snapshot as recovery evidence. It does
  not trigger restoration; restoration is manager-or-verification-failure
  only.
- `update` may target one exact Skill or an explicitly approved trusted batch.
- Re-read the changed `SKILL.md`, compare its hash, and record material trigger or description changes.
- A marketplace refresh is not the same as updating an installed plugin. Report that distinction.

## Publication policy

- Public build inputs may include only `public` and `creator-showcase` records.
- Public maintenance status may expose snapshot date, catalog counts, channel states, and a local handoff prompt.
- Never publish absolute paths, usernames, raw command output, raw session data, exact private usage, local-only names, or pending removal details.
- The standing default-public policy authorizes Private source commit/push plus deterministic sanitized Public Export staging after full verification. Explicit no-publish or local-only instructions override it.
- Private source and the maintenance CLI must never call `netlify deploy --prod`, upload a Private build to Production, or bypass the Public repository's required check.
- The only Production authority is the connected Public GitHub `main` after `release-gate`; Netlify consumes that exact commit. Pull requests, merges, default-branch changes, repository-visibility changes, and new Netlify sites still require separate approval unless the current request explicitly authorizes them.

## Obsidian policy

- Treat the Vault as the private complete view.
- Preserve text outside `skills-library-maintenance` marker blocks.
- Use UTF-8 and literal wikilink matching.
- Create or update affected Skill notes, category maintenance blocks, the active-global section, the private change log, the cemetery block, and monthly usage notes.
- Read back exact affected files after writing.

## Failure and rollback

- Stop before replacement if any rendered artifact fails validation.
- For trusted source-managed check-and-update, take the lightweight Skill
  snapshot before invoking the manager and restore it only on manager or
  verification failure.
- A restored folder and lock must reproduce every recorded before hash. If
  they do not, record `rollback-failed` and never report success.
- Store a private transaction manifest and backups for every replaced Vault file.
- If replacement partially fails, restore all changed files from that transaction.
- Leave Git changes unstaged so the user can inspect or discard them.
