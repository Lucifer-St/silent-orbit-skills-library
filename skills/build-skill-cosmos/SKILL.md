---
name: build-skill-cosmos
description: Build or refresh a private-first Silent Orbit Skill library by locating or initializing its project, running the silent-orbit CLI, explaining scan/analyze/diff results, obtaining explicit publication review, generating the static site, and reporting source or privacy diagnostics. Use when a user asks to create, rebuild, refresh, review, or diagnose their own Skill cosmos/library from SKILL.md folders, Codex global Skills, plugin manifests, or normalized JSON. Do not use it to install, update, remove, or disable Skills, or to publish/deploy the generated site.
---

# Build Skill Cosmos

Orchestrate `silent-orbit` as a thin review layer. Let the CLI own scanning, normalization, analysis, diffing, privacy validation, and generation.

## Load the right reference

- Read [cli-contract.md](references/cli-contract.md) before locating the executable or running commands.
- Read [project-schema.md](references/project-schema.md) before creating or editing sources, imports, or overrides.
- Read [review-contract.md](references/review-contract.md) before asking for publication approval or explaining risks.

## Keep the boundary

- Work only in the user-selected library project. Treat configured Skill sources as read-only.
- Never install, update, remove, disable, or rewrite real Skills.
- Never install the CLI automatically. If it is unavailable, report the missing dependency and stop.
- Never read Obsidian, session history, usage evidence, prompts, or private maintenance ledgers.
- Never push, open a PR, create a Netlify site, or deploy. Generation ends at local `dist/`.
- Never recreate scanner or analyzer logic in the Skill. Use CLI JSON output and validated project artifacts.
- Treat the generated `reference-index` site as a functional Map/Library preview, not an official art direction. Never prescribe themes or invoke a frontend tool on the user's behalf.
- Do not expose raw local paths, command stderr, hashes, or private artifact contents in the user-facing report.

## Run the workflow

1. Resolve the CLI and project using the order in `cli-contract.md`. Ask for a target directory when initialization would otherwise be ambiguous.
2. For an existing project, run `doctor --json` first. For a new project, confirm the target and run `init` once; never overwrite an existing config.
3. Add only user-approved sources. Use `import` for normalized JSON; edit `silent-orbit.config.json` only for the documented read-only source types.
4. Run `scan --json`. Report complete, partial, and failed sources separately, plus observed, inventory, review-required, local-only, warning, and error counts.
5. Run `analyze --json`. Explain inclusion, review-required decisions, exclusions, category inference, diagnostics, and existing overrides without treating inference as approval.
6. Present the proposed public boundary and request confirmation under `review-contract.md`. Do not generate a new or changed public set before confirmation.
7. Apply only the confirmed decisions to `silent-orbit.overrides.json`. After governance changes, rerun `scan` and `analyze`; after category or metadata-only changes, rerun `analyze`.
8. Run `diff --json`. Explain additions, changes, and removals by stable Skill name. Treat unexpected removals as unresolved risk, not approval.
9. Run `generate --json` only when the boundary is reviewed and no blocking error remains. Run `doctor --json` afterward and require `status: ok` for completion. Point out `dist/frontend-handoff.md` so the user can hand the public data contract to any preferred frontend Skill and visual style.

For an unchanged existing project with an empty diff and previously reviewed decisions, refresh without asking the user to reapprove every record; still summarize the retained public boundary.

## Report completion

Report:

- selected project and CLI version;
- source states and unrecognized providers;
- inventory, included, review-required, excluded, warning, and error counts;
- confirmed public/creator-showcase/local-only decisions;
- diff additions, changes, removals, and unresolved risks;
- generated Skill/category/source counts, `dist/` status, and final doctor status;
- Reference Preview status and the optional frontend handoff, without recommending a visual theme;
- explicit confirmation that real Skills and deployment systems were not modified.

Stop before generation when approval is missing, a source failed unexpectedly, a removal is unexplained, privacy evidence appears, or doctor reports an error.
