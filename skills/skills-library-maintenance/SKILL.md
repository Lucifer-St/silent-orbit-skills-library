---
name: skills-library-maintenance
description: Scan, reconcile, and maintain the user's Skills Library after global Skill installs, removals, updates, repairs, renames, or source changes; generate private monthly usage snapshots; check update channels; and synchronize the canonical Web Library data with the private Obsidian library. Use whenever a request installs, removes, updates, audits, or reconciles global Codex Skills, or asks about Skills Library drift, lifecycle history, monthly usage, or update status.
---

# Skills Library Maintenance

Maintain the live Skill surface, the versioned Web Library model, and the private Obsidian library as one reviewed workflow.

## Locate the system

Resolve the repository in this order: explicit CLI/env configuration, the current working tree, the private pointer at `%USERPROFILE%/.codex/skills-library-maintenance.json`, then this Skill's source tree. The canonical repository contains `outputs/data/` and `work/agent-os-index/`. If no valid repository can be found, stop and run `configure --repo-root <path>`; never guess a different project. Use the default private paths only when no explicit configuration is supplied:

- Runtime state: `<repo>/.skills-library-maintenance/`
- Obsidian: `%USERPROFILE%/Documents/Obsidian Vault/30 Resources/Codex Skill Library`
- Codex sessions: `%USERPROFILE%/.codex/sessions`

Read [system-contract.md](references/system-contract.md) before install, removal, update, publication, or rollback work. Read [data-contract.md](references/data-contract.md) before editing catalog fields or usage data.

## Run the CLI

Use `node <skill>/scripts/skills-library.mjs <command>`.

- `configure --repo-root <path> [--vault-root <path>]`: write the private machine-local project pointer used by installed copies of this Skill.
- `scan`: collect a private live snapshot without changing catalog or Vault files.
- `plan [--local-only <name>]`: compare live global Skills with public and private catalog records. New Skills are planned as `public` unless the request explicitly marks them private.
- `sync [--local-only <name>] [--publish <name>]`: add unambiguous Skills to the local Web Library and sanitized Public Export staging data by default, update Obsidian, and regenerate validated application data. Use `--local-only` only for an explicit privacy exception. Use `--publish` to promote an existing managed record. Require exact confirmation for every removal; unresolved removals return exit code 2.
- `check-and-update [--skill <name>]`: preview one trusted GitHub
  source-managed batch. After one exact batch approval, rerun with
  `--confirm-trusted-batch "<token>"`; the pinned manager then executes,
  followed by rescan, diff, Library/Obsidian sync, and verification.
- `check-updates`: compatibility alias for `check-and-update`. It is not
  read-only and must use the same Core and batch confirmation.
- `install --source <source> --confirm [--local-only]`: install globally, verify, plan, and sync. Default to the local + sanitized Public Export policy.
- `remove --skill <name>`: show the removal plan. Add `--confirm` only after the user explicitly approves the exact Skill.
- `update --skill <name>` or `update --all`: compatibility entry points into
  the same trusted-source Core. They require the exact reviewed batch token;
  they do not retain a second update implementation.
- `usage --month YYYY-MM --write`: aggregate private evidence and write the monthly Obsidian record. Use `--previous-month` for scheduled runs.
- `verify`: require zero unexplained global drift and confirm public outputs contain no private paths, raw usage, or `local-only` records.

## Transaction rules

1. Run `scan` before every mutation. A single reviewed batch approval may cover trusted source-managed check-and-update; destructive actions still require an exact plan.
2. Treat an external disappearance as drift, not permission to delete. Ask the user before applying a removal.
3. Never erase lifecycle history. Remove a Skill from active views, retain its stable name, and append a tombstone with time, source, and reason.
4. When a retired Skill reappears, reuse its record and apply the current default-public policy unless the request explicitly says `local-only` or no publication.
5. Default every newly discovered Skill to `visibility: public` and synchronize its sanitized record to the local Web Library and Public Export staging data. Treat explicit phrases such as private, local-only, do not publish, or no public release as an opt-out. Use `creator-showcase` only when creator authorship is established.
6. Infer `origin` from evidence. Use `unknown` when authorship cannot be proved; never infer authorship from Library placement.
7. Keep raw paths, full snapshots, session evidence, and exact monthly usage outside Git and public build inputs.
8. Synchronize affected Obsidian pages and managed index blocks only. Preserve user-authored content outside maintenance markers.
9. Run repository validation after sync. Re-scan the live surface and require the applied plan to converge.
10. A maintenance transaction stops after validated Private source changes and deterministic sanitized Public Export staging. Publication must continue through the designated Public repository, its required `release-gate`, Public `main`, and the connected existing Netlify site. Never run `netlify deploy --prod` from Private source or grant the maintenance Skill a second Production authority. Pull requests, merges, default-branch changes, repository-visibility changes, and new Netlify sites require separate approval unless the current request explicitly authorizes them.

## Trusted source-managed updates

- Treat pinned `skills@1.5.20` as a trusted external manager for approved
  GitHub source-managed global Skills.
- Describe native `check` accurately as check-and-update. Do not claim it is
  read-only or preview-only.
- Before a batch run, store a lightweight private snapshot of Skill names,
  source identities, folder hashes, and recoverable installed contents.
- Verify the local package lock, package metadata hash, registry integrity, and
  CLI bundle hash before both preview and execution.
- After the run, rescan and report every changed, added, missing, or failed
  Skill before synchronizing the Library.
- Restore the snapshot only when the manager exits unsuccessfully or post-run
  verification fails. This is best-effort Silent Orbit recovery, not a native
  manager transaction guarantee.
- Keep successful snapshots as private recovery evidence; never copy them into
  Git, Public Export, Obsidian, or a completion report.
- Keep Plugin and System channels report-only. Require separate explicit
  approval for deletion or installation from an unknown source.

## Monthly usage

Count unique Skill evidence per task/turn, not raw `SKILL.md` reads. Prefer explicit `$skill-name` requests and structured tool calls that load a concrete Skill. Store only aggregates: task count, last seen time, evidence types, and confidence. Never publish raw prompts or exact private usage.

## Web update handoff

Treat the website as a sanitized public projection and handoff surface. `sync` prepares reviewed Private source and deterministic Public Export inputs; it never deploys Private output directly to Production. The only Production chain is Private source → deterministic Public Export → Public GitHub `main` → required `release-gate` → connected Netlify Production. The site may display a sanitized snapshot and copy a local Codex prompt, but it must not claim to inspect or update the visitor's computer directly.

## Completion report

Report the live-before/live-after counts, additions, confirmed removals, update-channel results, Obsidian files affected, validation results, residual drift, Git status, deterministic Public Export status, and which Public PR/`release-gate`/Netlify handoff steps remain pending.
