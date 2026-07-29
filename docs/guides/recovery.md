# Recovery and rollback

Recovery is local, bounded, and evidence-driven. A successful command is not
automatically rolled back. Preserve the exact before state until verification
and handoff are complete.

## CLI or project upgrade

Before upgrading:

1. record the installed tarball SHA-256 and CLI version;
2. copy the project's `.silent-orbit/` runtime state and source imports;
3. record `doctor`, `audit`, and generated-output digests;
4. keep the prior verified release tarball.

If the upgrade fails, stop writes, restore the private project backup, reinstall
the prior verified tarball, then rerun `doctor` and compare the recorded
digests. Do not migrate an unsupported newer Schema back into v1 by hand.

## Agent Skill installation

Before replacing a global Agent Skill, copy its complete folder and record a
sorted SHA-256 manifest. After installation, compare the complete installed
folder with the verified release folder and re-read `SKILL.md`.

If the installed result or follow-up verification differs unexpectedly, restore
the exact folder backup and verify its manifest. A source conflict must be
resolved by a human; it is not permission to delete or overwrite unknown work.

## Trusted source-managed check-and-update

The Phase 5C host snapshots only the reviewed Skill folders and exact manager
lock. Manager, rescan, synchronization, or verification failure triggers
restore and digest verification inside that execution. `rollback-failed` is a
terminal fault, never success.

A successful run retains private recovery evidence and does not expose a
public one-click restore. Deletion, freeze, Plugin/System mutation,
unknown-source mutation, and arbitrary manual restore are outside this
supported batch.

## Public release and Production

The only Production path is:

`Private source -> deterministic Public Export -> Public PR -> release-gate -> Public main -> Git-connected Netlify Production`

Record the prior Public main commit, prior ready Production deploy, new Public
main commit, release digest, and release asset hashes. Production rollback must
be a reviewed Public Git revert or replacement PR that passes `release-gate`
and reaches Netlify through the existing Git connection. Never use a direct
Private-source or manual Netlify Production deploy as rollback.

## Escalation

Stop at the exact failing step when authorization is missing, a release tag
already exists, an installed Skill has untraceable differences, or Production
does not match Public `main`. Preserve logs and private evidence without
publishing secrets or local paths.
