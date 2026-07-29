# Privacy policy and data boundary

Silent Orbit is local-first. The hosted website is static and cannot inspect,
install, update, or remove files on a visitor's computer.

## Public release data

The Public Export may contain:

- `public` and `creator-showcase` catalog metadata;
- reusable Core, Schemas, CLI and sanitized Agent Skill instructions;
- synthetic or disposable fixtures and deterministic release evidence;
- public source URLs, license notices, and curated short summaries.

It must not contain private paths, installed folder hashes, locks, backups,
recoverable Skill contents, raw manager output, receipts from real runs,
prompts, sessions, usage evidence, Obsidian content, credentials, accounts,
personal outcomes, or `local-only` records.

## Browser data

The website stores optional outcomes in browser `localStorage`. It has no
project-operated backend, account system, analytics, advertising, behavior
tracking, or cross-device synchronization. Clearing site storage removes that
browser-origin copy.

## Local CLI and maintenance data

Generator imports, analysis, receipts, backups, and runtime state stay under
the local project or private maintenance root. Users choose what to publish
through explicit `public`, `creator-showcase`, `review-required`, and
`local-only` decisions.

Trusted source-managed check-and-update may contact npm and approved GitHub
sources through the pinned external manager. Silent Orbit keeps the selected
names, sources, hashes, contents, lock, and recovery receipt private. Plugin
and System channels remain separate.

## External services

GitHub hosts source, CI, and release assets. Netlify builds the connected
Public `main` commit and serves the static site. Their own service policies
apply. Silent Orbit does not send private maintenance state to either service.

## Contributor responsibility

Never attach private runtime evidence to an issue or pull request. Replace
paths, names, identifiers, logs, and source contents with minimal synthetic
fixtures. Run the release privacy validator before publication.
