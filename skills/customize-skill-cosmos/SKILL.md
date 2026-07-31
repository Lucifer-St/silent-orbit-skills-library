---
name: customize-skill-cosmos
description: Create and preserve a personalized Silent Orbit Skill-library frontend through a short aesthetic interview, exactly two substantive visual directions, explicit keep/adjust/reject/redo decisions, and refresh-safe data synchronization. Use after build-skill-cosmos has generated a valid project when the user wants the library to match their own visual taste. Do not change Skill governance, install or update Skills, publish, or deploy.
---

# Customize Skill Cosmos

Orchestrate the `silent-orbit customize` commands as a thin creative review
layer. The Agent owns the interview, explanation, and visual judgment. The CLI
owns contracts, stable IDs, immutable decision history, atomic writes, style
digests, refresh protection, and private receipts.

## Load the right reference

- Read [cli-contract.md](references/cli-contract.md) before resolving the CLI
  or project.
- Read [interview-contract.md](references/interview-contract.md) before asking
  aesthetic questions or creating a DesignProfileV2.
- Read [direction-review-contract.md](references/direction-review-contract.md)
  before proposing directions or recording a decision.
- Read [frontend-contract.md](references/frontend-contract.md) before creating
  direction tokens, reviewing previews, or refreshing data.

## Keep the boundary

- Require an existing generated Silent Orbit project with valid
  `dist/site-data.json` and `dist/frontend-handoff.v2.json`.
- Consume only those public-safe files plus
  `.silent-orbit/customization/`. Never read private inventory, imports,
  analysis, maintenance state, Skill bodies, Obsidian, sessions, prompts,
  usage evidence, or absolute local paths.
- Never change visibility, origin, taxonomy, membership, or public counts.
- Never install, update, remove, freeze, or restore real Skills.
- Never publish, push, open a PR, create a site, or deploy.
- Keep candidates under `customization/rounds/` and the selected result under
  `customization/current/`. Never write personalization into `dist/`.
- Do not reproduce state-machine or refresh logic in the Skill. Use the CLI.

## Run the workflow

1. Resolve the CLI and project under `cli-contract.md`. Run
   `capabilities --json`; require customization `supported` with contract
   family `v2-sidecar`.
2. Run `customize doctor --json`. If customization is not prepared, continue
   only when the generated handoff passes. If it exists, preserve its profile
   and decision history.
3. Conduct the short interview in `interview-contract.md`. Save only the
   summarized DesignProfileV2 fields, never the raw conversation.
4. Create exactly two directions that differ on at least two structural axes:
   layout, density, typography, motion, or shape. Color-only variants are
   invalid.
5. Write a prepare request and run `customize prepare --request ... --json`.
   Show both functional preview directories and explain how each direction
   connects to the profile.
6. Ask for one explicit decision:
   - `保留 / keep`: select the direction and promote it to
     `customization/current/`;
   - `调整 / adjust`: preserve the parent and create one child revision;
   - `拒绝 / reject`: mark it ineligible for selection;
   - `重做 / redo`: close the round, inherit concise feedback, and produce
     exactly two new directions.
7. Record the choice with `customize decide --request ... --json`. Never
   rewrite or delete earlier rounds, directions, or decisions.
8. After the selected project data is regenerated, run
   `customize refresh --json`. Require `stylePreserved: true`, then run
   `customize doctor --json` and require `status: ok`.

## Report completion

Report the profile revision, round, active or selected direction, decision,
preview/current status, Library Snapshot binding, style-preservation result,
and customization doctor status. State explicitly that Skill governance, real
Skills, publishing, and deployment were unchanged.

Automated Codex, Claude Code, or Kimi Code runs prove portability only. They do
not count as independent-human acceptance.
