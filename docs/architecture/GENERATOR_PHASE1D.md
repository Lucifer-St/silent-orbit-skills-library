# Generator Phase 1D: universal Agent Skill

Status: implemented on `codex/generator-phase1d`
Input: the installable `silent-orbit` CLI from Generator Phase 1C

## Purpose

Phase 1D adds `build-skill-cosmos`, a portable Agent Skill that guides another Agent through locating or initializing a library project, invoking the CLI, explaining scan/analyze/diff results, obtaining publication confirmation, generating the local site, and reporting safe diagnostics.

The Skill is deliberately a thin orchestration and review layer. Scanner, normalization, taxonomy scoring, contract validation, privacy filtering, stable identity, diffing, atomic generation, and receipts remain in the CLI.

## Package

```text
skills/build-skill-cosmos/
├─ SKILL.md
├─ agents/openai.yaml
└─ references/
   ├─ cli-contract.md
   ├─ project-schema.md
   └─ review-contract.md
```

There are no Skill-owned scripts or assets. `SKILL.md` contains only the trigger, boundaries, main workflow, and completion report. Detailed CLI and schema guidance is loaded progressively from one-level references.

## Responsibilities

The Skill:

- resolves a user-selected project and available `silent-orbit` CLI;
- initializes a project only after the target is unambiguous;
- configures read-only sources or imports normalized JSON;
- runs and interprets `doctor`, `scan`, `analyze`, `diff`, and `generate`;
- separates observed, inferred, and curated decisions;
- requests explicit approval for a new or changed public boundary;
- reports unknown sources, failed adapters, privacy diagnostics, and unexplained removals;
- verifies local generation with a final `doctor` result.

The Skill never:

- installs, updates, removes, disables, or rewrites real Skills;
- downloads or installs the CLI automatically;
- reads Obsidian, session history, prompts, or usage evidence;
- creates a GitHub PR, changes a repository, creates a Netlify site, or deploys;
- reimplements deterministic CLI behavior.

## Validation

The package must pass the official `skill-creator` `quick_validate.py`, repository contract tests, deterministic Public Export, and a forward test by a fresh Agent that receives only the Skill path plus a realistic user request and isolated fixture project.

Phase 1E adds a fixed independent-environment Alpha acceptance. It records `humanFeedback: false`: the reproducible environment proves portability and boundary behavior without claiming real external-user feedback.
