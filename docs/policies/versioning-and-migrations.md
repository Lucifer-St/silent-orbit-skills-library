# Versioning, compatibility, migrations, and deprecation

This policy applies to the Silent Orbit Public Generator, its JSON contracts,
the `silent-orbit` CLI, and the bundled Agent Skills.

## Release candidate

| Surface | Candidate | Compatibility promise |
|---|---:|---|
| Repository and package | `0.13.1-beta.1` | `0.13.x` beta line |
| CLI interface | `0.6.0` | frozen generator v1 and customization v2 plus additive experience v3 |
| JSON Schemas | frozen `v1` + frozen additive `v2` + additive `v3` | exact files in all Schema locks |
| Runtime | Node.js 24 | tested release runtime |
| Trusted external manager | `skills@1.5.20` | exact content-addressed Phase 5C integration |

This is a pre-release. It is not `v1.0.0`, and the package is not published to
the npm registry.

### v0.13.1-beta.1 release-chain hardening candidate

This prerelease replaces the immutable `v0.13.0-beta.1` candidate with a new
version whose release receipt is finalized before assets are prepared. It adds
fail-closed Agent Skill validation, project-local CLI discovery, explicit
audit-versus-maintenance routing, production-parity deploy previews, and
portfolio-facing release documentation.

The package patch does not change the CLI interface or JSON contracts. CLI
`0.6.0`, frozen v1/v2 contracts, and additive v3 contracts remain compatible;
no project migration is required.

### v0.13.0-beta.1 additive repair candidate

This prerelease provides an additive CLI `0.6.0` candidate on top of the
published beta.1 without changing its tag, assets, or historical description.
All frozen v1 schemas and v2 schema digests remain unchanged. Explicitly
versioned `CustomizationExperienceV3`, `CustomizationOnboardingV3`, and
`CustomizationInterviewV3` companions plus the versioned novice human report
schema are added under a separate `schema-lock.v3.json`.

CLI `0.6.0` adds read-only preflight, explicitly consented project-only setup,
a persisted one-question interview, `prepare --from-interview`, and natural
language `respond`. Existing v2 requests, state, manifest, and handoff remain
readable; v3 is not inserted into a v2 schema and no background migration is
performed. An old project first runs preflight and creates the project-local
onboarding sidecar only with user consent. Declining consent leaves the project unchanged.
The existing `capabilities` response remains the frozen `SilentOrbitCapabilitiesV2` by
default; callers opt into the additive `SilentOrbitCapabilitiesV3` response with
`capabilities --contract v3`.

`0.12.0-beta.1` adds a separate personal-aesthetic workflow without changing
the frozen v1 generator contracts. CLI `0.5.0` adds `capabilities` and
`customize status|prepare|decide|refresh|doctor`. The new v2 sidecar contracts
support exactly two structurally distinct directions, explicit
keep/adjust/reject/redo history, private summarized preferences, and
refresh-safe style preservation. Existing v1 projects remain readable;
rerunning `generate` adds `frontend-handoff.v2.json` before customization.

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

## Frozen v1 Schema family and additive v2 sidecars

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

`schemas/schema-lock.v2.json` covers only the additive customization and
frontend handoff sidecars. Those files do not redefine or migrate any v1
project, inventory, library, or site-manifest field. A generated project needs
the new v2 handoff before customization, but its v1 source state remains
unchanged.

`schemas/schema-lock.v3.json` covers the three additive newcomer companions and
the novice human report v1 schema, and declares that v1 and v2 are unchanged. A future
incompatible change requires another schema version and an explicit migration;
it may not overwrite v3 or silently mutate v2.

## Current migration baseline

No migration is required inside the v1 family. `0.13.1-beta.1` continues to
read and write the frozen v1 contracts. It must reject an unsupported newer
schema instead of silently coercing it.

The customization v2 family is a sidecar, not a v1 migration. Run `generate`
to create the machine handoff, then start customization explicitly. No
background migration is performed.

## Deprecation

- Mark a deprecated command, field, or Skill entry in CLI help, Schemas or
  documentation, and release notes.
- Keep it working for at least one subsequent package minor line and at least
  30 days, whichever is longer.
- Publish the replacement and migration instructions before removal.
- Security or privacy emergencies may shorten the window. The release notes
  must explain the exception and provide the safest available recovery path.

`check-and-update` remains canonical. The compatibility names
`check-updates` and source-managed `update` route to the same guarded Core and
are not separate implementations. No removal date is scheduled.

## Capability compatibility

Only the host-injected, reviewed GitHub source-managed check-and-update batch is
supported. Standalone real-profile mutation, install from unknown sources,
freeze, deletion, Plugin mutation, and System mutation remain `unknown`,
`unsupported`, or separately gated. A version bump must never turn missing
evidence into a support claim.
