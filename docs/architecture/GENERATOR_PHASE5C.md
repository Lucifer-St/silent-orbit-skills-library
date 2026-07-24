# Generator Phase 5C — Trusted-source Maintenance

Status: implemented and accepted in Phase 5C; Phase 6A packages the sanitized
host and management Skill for GitHub Pre-release installation.

## Supported workflow

Phase 5C adds one host-injected maintenance operation for reviewed GitHub
source-managed global Skills:

1. verify the content-addressed `skills@1.5.20` package and lock;
2. review one exact batch of names, source identities, and before hashes;
3. capture private recoverable contents plus the exact manager lock;
4. run native `check` as check-and-update for only the reviewed names;
5. rescan and report the folder-hash diff;
6. atomically synchronize the Library and private Obsidian projection;
7. verify convergence;
8. restore the Skill folders and lock only when the manager or verification
   fails.

`check-and-update` is canonical. `check-updates` and the source-managed
`update` entry are compatibility aliases backed by the same Core.

## Manager identity

The host verifies all of the following before preview and execution:

- package/version: `skills@1.5.20`;
- registry integrity:
  `sha512-lPl5KzMfTW+qwHFwc8t6R+wAqmdmSHw1+HWbGdJ/FZYbWLdB34bAZNFWiencM5DVoRaKAgXArmfTWMlNAbl9Gg==`;
- CLI bundle SHA-256:
  `fa5c073b5666b2e096112ad34da80ec20500d1d7f0a32ced77f3eff785562528`;
- package metadata SHA-256:
  `6fde39f7b97401853bcdad4de1395411b9845b858497e1697bcb50b4ac9a1609`.

Native `check`, `update`, and `upgrade` share a direct-write path. Silent
Orbit therefore records `nativeTransactionGuarantee: false`. Its snapshot and
restore are an outer recovery layer, not a native manager guarantee.

Legacy GitHub source-managed entries that predate lock folder hashes remain
inside the reviewed snapshot and receipt. They are identified as
`lockFolderHashUnavailable`: the manager can still check and update them, but
the Core cannot use a lock hash as the local-drift baseline. The Core therefore
binds its own computed pre-run folder hash into the reviewed batch and reports
an update only when the post-run diff proves one.

## Approval and channel boundary

One exact confirmation may cover the complete reviewed GitHub batch. It does
not authorize deletion, unknown-source installation, Plugin mutation, or
System Skill mutation. Those remain separate blocked or confirmed actions.

The standalone CLI has no trusted maintenance host and cannot discover or
connect to a real global Skill root. `manage-skill-cosmos` and the separately
installed `skills-library-maintenance` host both route the supported batch
through the same trusted-source maintenance Core. Packaging the host does not
configure a repository or authorize a check-and-update.

## Recovery and privacy

The private snapshot contains only the reviewed Skill names, sources, hashes,
recoverable folder contents, and exact lock bytes. A successful run retains
the snapshot as private recovery evidence and does not restore it. Manager,
rescan, synchronization, or verification failure restores the before folders
and lock and proves their hashes. Any mismatch is `rollback-failed`, never
success.

Plans, absolute roots, source instances, locks, backups, raw manager output,
receipts, and Obsidian state remain outside Public Export. Public source may
contain reusable Core code, contracts, synthetic/disposable tests, and
sanitized documentation only.

## Disposable acceptance

The complete workflow is tested first beneath the operating-system temporary
directory using an isolated profile, local Git source, the actual pinned
manager, private recovery root, disposable Library/Vault, and no-op generated
application adapter. Synthetic tests cover manager failure, verification
failure, exact folder/lock restoration, source and channel exclusions, and
standalone-host blocking.
