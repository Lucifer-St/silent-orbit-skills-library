---
name: manage-skill-cosmos
description: Explain Silent Orbit Provider results and ManagementPlanV1 output, coordinate trusted source-managed check-and-update, invoke the guarded management CLI, and interpret receipts. Use when a user asks to assess or perform an install, update, freeze, remove, or restore through `silent-orbit manage`; keep unsupported operations blocked and disclose trusted external manager behavior.
---
# Manage Skill Cosmos

Act only as an explanation and confirmation wrapper around the `silent-orbit`
CLI. Keep capability checks, digests, backup, rescan, verification, rollback,
and receipts in Core or the host-injected Provider.
## Trusted-source check-and-update

For a reviewed Phase 5C batch, invoke:

```text
silent-orbit manage check-and-update --request <trusted-batch-request.json> --json
```

The host owns the pinned manager, profile, private recovery root, rescan,
Library/Obsidian sync, and verification. Report exact names, GitHub sources,
before hashes, exclusions, and the single batch token. Then invoke:

```text
silent-orbit manage check-and-update --request <trusted-batch-request.json> --confirm "<exact batch token>" --json
```

`check-updates` is a non-read-only compatibility alias. The same Core backs
this command and the private `skills-library-maintenance` host.

## Explain the Provider result

1. Report Provider, operation, capability state, evidence IDs, failed criteria,
   and the go/no-go result.
2. Treat `no-go`, `unknown`, and `unsupported` as hard read-only stops.
3. Never promote a Provider, invent evidence, or bypass a blocker.
4. For Phase 5B, native `check` aliases the mutation path and requires one
   marked disposable profile plus one exact source-managed Skill.
5. State all execution exceptions: trusted external writes have no independent
   staging or native Phase 5A transaction guarantee.
6. Phase 5C allows one batch approval, a lightweight before-snapshot, rescan,
   and failure-only restore; it excludes Plugin, System, deletion, and unknown
   sources.

## Review the plan

1. Invoke `silent-orbit manage plan --request <request.json> --json`.
2. Explain capability state, evidence IDs, execution mode, targets, digest
   preconditions, impact, backup, verification, rollback, and blockers.
3. Require a host-injected Provider. The standalone CLI registry is empty and
   must not auto-connect to a real global Skill root.
4. Treat `unknown`, `unsupported`, `no-update`, or `executable: false` as a
   read-only stop.
5. Preserve private plan JSON, IDs, digests, targets, evidence, and tokens.

## Dry-run before confirmation

Invoke:

```text
silent-orbit manage apply --plan <plan.json> --dry-run --json
```

Require `status: dry-run`, matched read-only preconditions, no transaction ID,
and zero writes. Dry-run is not mutation approval.

## Request exact confirmation

Show the complete `plan.confirmation.token` with the plan summary. Ask the user
to return that token exactly; broad, prior, paraphrased, or cross-plan approval
is invalid. Then invoke:

```text
silent-orbit manage apply --plan <plan.json> --confirm "<exact token>" --json
```

## Interpret the receipt

- Report success only for `status: succeeded` with verification passed.
- Report `rolled-back` as a failed action whose pre-action digest was restored.
- Report `rollback-failed` as an explicit critical failure, never success.
- For trusted external execution, repeat `nativeTransactionGuarantee: false`
  and its accepted exceptions even when the outer receipt succeeds.
- Keep plans, roots, backup manifests, receipts, runtime state, and failure
  details private and out of Public Export.

## Boundaries

- Do not scan the Skill surface independently.
- Do not implement Provider detection, update selection, file writes, backup,
  verification, or rollback in this Skill.
- Do not call install, update, freeze, remove, or restore outside the guarded
  management CLI.
- Phase 5B authorizes only host-injected, single-Skill update in a marked
  disposable profile. Install, freeze, remove, and restore remain `unknown`.
- Phase 5C real global mutation requires the injected trusted maintenance host,
  one reviewed batch confirmation, and the private recovery/sync callbacks.
- Keep Plugin, System, deletion, and unknown-source installation separately
  approved and outside the batch.
- The standalone CLI has no trusted maintenance host and must remain blocked.
