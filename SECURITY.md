# Security policy

## Reporting a vulnerability

Please do not publish sensitive details in a GitHub issue. Use GitHub's private vulnerability reporting feature for this repository when it is available. If private reporting is unavailable, open a minimal issue asking the maintainer for a private contact channel without including exploit details, credentials, personal data, or local paths.

Include:

- the affected commit or version;
- a concise description of the impact;
- safe reproduction steps;
- whether the issue can expose browser-local outcomes or public-release boundary data.

## Supported surface

Security review covers the current `main` branch, the latest GitHub
Pre-release, and the Production build produced from the same Public `main`
commit. This beta does not promise long-term support for older pre-releases.
The project is a static client application with no project-operated backend.
Browser extensions, third-party Skill sources, GitHub, Netlify, npm, and the
visitor's browser remain separate security boundaries.

## Release and supply-chain controls

- Release assets include SHA-256 checksums and are installed from a downloaded
  GitHub Pre-release file, not from the npm registry.
- Versioned v1 Schemas are locked by `schemas/schema-lock.v1.json`.
- Public changes must pass the required `release-gate` before merge.
- Production is built only from connected Public GitHub `main`; direct Private
  or manual Netlify Production deploys are prohibited.
- Source-managed check-and-update uses the exact content-addressed
  `skills@1.5.20` integration. Its native writes are not a transaction.

Review the release checksum, Agent Skill instructions, requested source
identities, and exact confirmation token before any real maintenance action.
Do not treat `check`, `update`, or `upgrade` as read-only.

## Public data boundary

The public release must not contain private paths, accounts, sessions, credentials, personal outcomes, usage evidence, private maintenance state, knowledge-base content, or third-party instruction files. The release validator and manifest are defense-in-depth controls, not permission to publish unreviewed data.

## Recovery and incident response

Stop writes when verification, source identity, or digest checks fail. Preserve
private evidence, restore only from a verified bounded backup, and report
`rollback-failed` as a terminal fault. Production recovery must go through a
reviewed Public PR, `release-gate`, Public `main`, and the existing Git-connected
Netlify site. See `RECOVERY.md` for the complete rollback boundary.
