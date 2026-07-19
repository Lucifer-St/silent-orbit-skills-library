# Security policy

## Reporting a vulnerability

Please do not publish sensitive details in a GitHub issue. Use GitHub's private vulnerability reporting feature for this repository when it is available. If private reporting is unavailable, open a minimal issue asking the maintainer for a private contact channel without including exploit details, credentials, personal data, or local paths.

Include:

- the affected commit or version;
- a concise description of the impact;
- safe reproduction steps;
- whether the issue can expose browser-local outcomes or public-release boundary data.

## Supported surface

Security review covers the current `main` branch and the production build produced from it. The project is a static client application with no project-operated backend. Browser extensions, third-party Skill sources, GitHub, Netlify, and the visitor's browser remain separate security boundaries.

## Public data boundary

The public release must not contain private paths, accounts, sessions, credentials, personal outcomes, usage evidence, private maintenance state, knowledge-base content, or third-party instruction files. The release validator and manifest are defense-in-depth controls, not permission to publish unreviewed data.
