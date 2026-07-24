# Generator Phase 5B — Single Provider Evaluation

Status: GO under the approved trusted-external-manager exception.

## Post-acceptance product policy

After the technical evaluation, the acceptance owner selected a pragmatic
trusted-source policy for Phase 5C. For approved GitHub source-managed Skills,
native `skills check` is treated as check-and-update rather than rejected for
failing a read-only contract. The product prioritizes manager convenience over
one Phase 5A plan and confirmation token per Skill.

The retained minimum boundary is: pin the manager, capture a lightweight
private before-snapshot, execute one approved trusted batch, rescan and report
the diff, synchronize the Library, and restore only on manager or verification
failure. Deletion, unknown-source installation, Plugin mutation, and System
Skill mutation remain separately gated.

This policy change does not alter the Phase 5B implementation or erase its
evidence. The shipped Phase 5B Provider remains disposable-only; Phase 5C must
implement and test the practical real-profile host before claiming that
capability.

## Supported surface

Phase 5B supports exactly one Provider operation:

- manager: content-addressed `skills@1.5.20`;
- Provider: source-managed Codex global Skill;
- operation: `update`;
- selection: one exact Skill name and source identity;
- scope: one host-injected, explicitly marked disposable profile;
- authority: an exact `ManagementPlanV1` confirmation token.

Install, freeze, remove, and restore remain `unknown` and read-only. Plugin and
System Skill mutation are outside this phase.

The supported capability evidence binds the package version, registry
integrity, CLI bundle SHA-256, package metadata SHA-256, exact update command,
candidate revision and folder hash, lock source, and post-update installed/lock
hash verification.

## Accepted external-manager exceptions

The acceptance owner explicitly treats `vercel-labs/skills@1.5.20` as a
trusted external Skill manager. Every plan and receipt therefore exposes:

- execution mode `trusted-external-manager`;
- `native-direct-write`;
- `no-native-staging`;
- `no-native-transaction-rollback`;
- `nativeTransactionGuarantee: false`.

These are deliberate upstream-risk exceptions. Native `check`, `update`, and
`upgrade` share the mutation routine; native update writes directly and does
not inherit the Phase 5A Core writer, independent staging, or native
transaction rollback guarantees.

Silent Orbit still wraps the complete disposable profile with Phase 5A outer
guards: exact confirmation, pre-digest drift detection, bounded allowed root,
copy-before-apply backup, Core-observed rescan, Provider verification, private
receipt, and digest-verified restoration on failure. That outer wrapper must
not be described as a native `skills` transaction guarantee.

## Provider binding

The Provider factory refuses ambient discovery. A host must inject:

- the exact content-addressed `skills@1.5.20` package root;
- a profile beneath the operating-system temporary directory;
- a valid Phase 5B disposable sentinel and isolated home/state/config/temp
  directories;
- one committed candidate repository;
- one exact Skill, expected lock source/type, and portable source identity.

The target is the whole disposable profile so manager-owned writes remain
inside the declared target and outer backup boundary. `changes` is empty:
manager-owned writes are not misrepresented as Core-writer changes.

The child manager receives isolated home, Agent, Codex, XDG, application-data,
and temporary paths, with telemetry disabled. It runs the pinned CLI entry
directly rather than resolving `npx`. The standalone `silent-orbit` Provider
registry remains empty and cannot auto-connect to a real global Skill root.

## Verification and failure behavior

Preview verifies current installed content against the disposable lock,
captures the committed candidate revision/hash, and emits a deterministic
plan. A matching candidate produces a `no-update` blocker with zero writes.

After native update, Provider verification requires:

1. unchanged exact lock source/type;
2. unchanged candidate revision/hash;
3. installed Skill hash equal to the candidate hash;
4. lock folder hash equal to the candidate hash.

Manager failure, partial write, rescan failure, or verification failure enters
the outer rollback path. A restored profile must match its pre-action digest.
A failed restoration is `rollback-failed`, never success.

Tests use only temporary marked profiles, local disposable Git sources,
explicit allowed roots, temporary transaction roots, and synthetic manager
failure injection. The pinned manager integration uses a localhost disposable
Git server and never addresses a real Agent/Skill root.

## Public boundary and Phase 5C

Public Export may include the reusable capability, Provider, Core, schemas,
thin Agent Skill, documentation, and synthetic tests. It must not contain
absolute runtime paths, injected roots, candidate/plan instances, locks,
backups, receipts, installed Skill bodies, or runtime status.

Phase 5C was not executed in Phase 5B. It is now authorized as the
trusted-source maintenance closeout: update the semantic contract to
check-and-update, add the lightweight before-snapshot and failure-only restore,
unify the two maintenance entry points, validate in a disposable profile, then
stop for explicit confirmation immediately before the first real global run.
