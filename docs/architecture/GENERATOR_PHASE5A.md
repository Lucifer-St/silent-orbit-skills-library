# Generator Phase 5A — Guarded Skill Management Foundation

Status: implemented foundation; no live mutation Provider registered.

## Scope

Phase 5A adds reusable contracts and a transaction engine without enabling
install, update, freeze, remove, or restore against a real Skill surface.

- `ProviderCapabilityV1` describes each operation independently.
- `ManagementPlanV1` is deterministic and contains no absolute runtime root.
- `ManagementReceiptV1` is a private transaction outcome.
- `silent-orbit manage plan` emits a JSON plan.
- `silent-orbit manage apply --dry-run` performs no writes.
- `manage-skill-cosmos` is an explanation and confirmation wrapper only.

## Capability contract

The only capability states are `supported`, `unsupported`, and `unknown`.
Missing operation evidence defaults to `unknown`. Unknown and unsupported
operations use `read-only` access.

A supported operation must reference evidence whose SHA-256 verifier matches
the Provider ID, operation, evidence kind, claim, and structured basis. The
Core re-runs the Provider capability probe immediately before execution and
rejects capability or evidence drift.

The standalone Phase 5A CLI has an empty Provider registry. A future host must
inject a reviewed Provider; shipping the Core does not grant live mutation
authority.

## Plan contract

Plans contain:

- Provider and operation identity;
- portable root and target IDs with normalized relative paths;
- capability evidence and digest;
- current and expected post-action target digests;
- allowed-root and digest preconditions;
- a bounded change set and impact summary;
- copy-before-apply backup instructions;
- ordered precondition, backup, apply, rescan, verify, conditional rollback,
  and receipt steps;
- an exact plan-bound confirmation token.

Absolute roots are supplied only at runtime. They are not part of the plan ID,
so equivalent Windows and POSIX relative paths produce the same plan.

## Transaction contract

Execution order is fixed:

1. Revalidate the immutable plan and supported capability.
2. Require the exact confirmation token for a mutation.
3. Resolve every target inside an explicit allowed root and reject symbolic
   link or junction traversal.
4. Recompute every pre-action digest and stop on drift.
5. Back up every declared target before the first change.
6. Let the Provider request only declared, ordered Core writes.
7. Rescan with Core and Provider observations.
8. Verify every expected post-action digest and Provider result.
9. On any apply, rescan, or verification failure, restore every backup and
   verify the original digests.
10. Seal a complete private receipt.

`rollback-failed` is a distinct failure state. It includes the unresolved
targets and must never be converted to success.

## Dry-run contract

Dry-run performs capability and precondition reads only. It does not:

- request exact mutation confirmation;
- call Provider apply, rescan, or verify hooks;
- create a transaction directory;
- create a backup or receipt file;
- modify a target.

## Public and private boundary

Public Export may include the schemas, Core, CLI, architecture document, thin
Agent Skill, and synthetic tests. It must not include:

- allowed-root mappings or absolute paths;
- request or plan instances;
- backup trees or backup manifests;
- transaction receipts or runtime directories;
- real Provider output, Skill bodies, usage, sessions, or private ledgers.

All failure-injection tests use temporary directories and synthetic Providers.
