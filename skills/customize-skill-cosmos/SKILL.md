---
name: customize-skill-cosmos
description: Guide a newcomer through a project-safe Silent Orbit personalization preflight, one everyday question at a time, exactly two functional directions, explicit restyle/adjust/redesign decisions, and refresh-safe data synchronization. Use after build-skill-cosmos has generated a valid project when the user wants the library to match their own visual taste. Do not change Skill governance, install or update Skills, publish, or deploy.
---

# Customize Skill Cosmos

Orchestrate the `silent-orbit customize` commands as a newcomer-friendly
creative review layer. The Agent owns plain-language explanation and visual
judgment. The CLI owns the read-only preflight, consent gate, one-question
interview, normalization, stable IDs, immutable history, style and structure
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
- Preflight is read-only. Never install globally, change the system, scan an
  unrelated directory, or write before the user supplies the exact project
  setup confirmation token. Setup may write only the path named by preflight.
- Do not reproduce state-machine or refresh logic in the Skill. Use the CLI.

## Run the workflow

1. Resolve the candidate CLI and one explicit project under
   `cli-contract.md`. Check capabilities; do not infer compatibility from a
   package tag.
2. Before any interview, run `customize preflight`. Tell the user in plain
   language what is ready, what is missing, why it matters, the one project
   file setup would write, and what it will never touch. If setup is needed,
   wait for the exact confirmation token. If setup is refused, stop without a
   write and offer the read-only explanation as the fallback.
3. Run the persisted interview from `interview-contract.md`. Present only the
   current everyday question, its examples, progress, and the skip/uncertain
   escape. Save normalized summaries and inferences, never raw answers.
4. Show the plain `我理解的是……` review. Reveal layout, density, typography,
   motion, schema, and digests only when advanced information is requested.
5. Confirm the review, then run `customize prepare --from-interview`. Show
   exactly two functional previews. Their structure digests must differ;
   palette-only alternatives are invalid.
6. Ask for one explicit decision or natural-language correction:
   - `保留 / keep`: select the direction and promote it to
     `customization/current/`;
   - `换皮 / restyle`: change colors, type, or surface detail while preserving
     structure;
   - `调整 / adjust`: revise the current structure without pretending it was
     regenerated;
   - `拒绝 / reject`: mark it ineligible for selection;
   - `重做 / redesign / redo`: close the round, preserve concise feedback, and
     produce exactly two new directions whose nodes, groups, edges, or layout
     strategy have a verifiable structural difference from the prior round.
7. Use `customize respond` for natural-language restyle/adjust/redesign, or
   the low-level `customize decide` contract for an already explicit action.
   Never rewrite or delete earlier rounds, directions, or decisions.
8. After the selected project data is regenerated, run
   `customize refresh --json`. Require `stylePreserved: true`, then run
   `customize doctor --json` and require `status: ok`.

## Report completion

Report the profile revision, preferred default view, round, active or selected
direction, decision kind, preview/current status, snapshot binding,
style-preservation result, structural change when applicable, and doctor
status. State explicitly that Skill governance, real Skills, global/system
configuration, publishing, and deployment were unchanged.

Automated Codex, Claude Code, or Kimi Code runs prove portability only. They do
not count as independent-human acceptance.
