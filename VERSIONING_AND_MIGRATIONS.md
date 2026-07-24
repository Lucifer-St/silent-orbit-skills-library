# Versioning, compatibility, migrations, and deprecation

This policy applies to the Silent Orbit Public Generator, its JSON contracts,
the `silent-orbit` CLI, and the bundled Agent Skills.

## Release candidate

| Surface | Phase 6A candidate | Compatibility promise |
|---|---:|---|
| Repository and package | `0.11.0-beta.4` | `0.11.x` beta line |
| CLI interface | `0.4.0` | `0.4.x` command and JSON family |
| JSON Schemas | `v1` | exact files in `schemas/schema-lock.v1.json` |
| Runtime | Node.js 24 | tested release runtime |
| Trusted external manager | `skills@1.5.20` | exact content-addressed Phase 5C integration |

This is a pre-release. It is not `v1.0.0`, and the package is not published to
the npm registry.

## Semantic versioning

The repository/package version and CLI interface version are independent:

- Package patch releases do not intentionally break the documented package,
  installed Agent Skill, Schema, or website contract.
- Before `1.0.0`, a package minor release may make a breaking change only when
  the release notes identify it, a migration or replacement path exists, and
  the deprecation policy below has been followed.
- CLI major changes break a documented command, argument, exit-status, or JSON
  contract. CLI minor changes are additive. CLI patch changes preserve the
  documented interface.
- A website-only correction does not require a CLI version change.

## Frozen v1 Schema family

`schemas/schema-lock.v1.json` records every released `*.v1.schema.json` file and
its SHA-256 value after canonical LF line-ending normalization. The release gate
recomputes every digest and rejects missing, extra, or changed v1 Schemas on
Windows, macOS, and Linux.

The v1 files are immutable once `v0.11.0-beta.4` is published. A change to field
meaning, required fields, validation behavior, or accepted values requires:

1. a new `*.v2.schema.json` file and `schemaVersion: 2`;
2. a documented compatibility decision for readers and writers;
3. a deterministic migration command with dry-run output;
4. a pre-write backup and a post-migration validation receipt;
5. fixtures proving both the last supported v1 input and the new v2 output.

Examples and prose may be corrected without changing a Schema digest. The lock
file itself is versioned separately from the locked Schemas.

## Current migration baseline

No migration is required inside the v1 family. `0.11.0-beta.4` reads and writes
the frozen v1 contracts. It must reject an unsupported newer schema instead of
silently coercing it.

When a v2 family is introduced, migration must be explicit and local. It may
not overwrite the only copy, publish private runtime state, or claim success
until the new document validates. Automatic background migration is not
supported.

## Deprecation

- Mark a deprecated command, field, or Skill entry in CLI help, Schemas or
  documentation, and release notes.
- Keep it working for at least one subsequent package minor line and at least
  30 days, whichever is longer.
- Publish the replacement and migration instructions before removal.
- Security or privacy emergencies may shorten the window. The release notes
  must explain the exception and provide the safest available recovery path.

`check-and-update` is canonical in `0.11.x`. The compatibility names
`check-updates` and source-managed `update` route to the same guarded Core and
are not separate implementations. No removal date is scheduled.

## Capability compatibility

Only the host-injected, reviewed GitHub source-managed check-and-update batch is
supported. Standalone real-profile mutation, install from unknown sources,
freeze, deletion, Plugin mutation, and System mutation remain `unknown`,
`unsupported`, or separately gated. A version bump must never turn missing
evidence into a support claim.
