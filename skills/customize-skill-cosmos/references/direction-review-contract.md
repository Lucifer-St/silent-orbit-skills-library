# Direction review contract

## Create two real alternatives

Every round begins with exactly two directions. They must differ on at least
two of:

- layout: `editorial-rail` or `signal-grid`
- density: `airy`, `balanced`, or `compact`
- typography: `editorial`, `technical`, or `humanist`
- motion: `still`, `measured`, or `expressive`
- shape: `square` or `soft`

Each direction also provides a five-color palette: paper, ink, muted, line,
and accent. Each materialized preview has a public-data-only structure source
and structure digest. Two palettes on the same structure are not two
directions.

Each direction needs a short label and rationale tied to the DesignProfileV2.
Do not invent product claims, navigation, metrics, or content.

## Decisions

First classify natural feedback by meaning:

- `restyle`: colors, type, border, texture, or other surface details; structure
  and structure digest stay unchanged.
- `adjust`: a bounded change inside the current organization. Preserve the
  parent and do not call it a new information architecture.
- `redesign` / `redo`: feedback such as `重做地图`, `节点太挤`, `连线没意义`, or
  `换一种组织方式`. Close the round and regenerate information architecture.

- `keep`: only an active candidate may be selected. It becomes current; other
  active directions become superseded.
- `adjust`: target one active candidate, preserve it as superseded, and create
  a child revision from precise feedback. A previously rejected alternative
  stays rejected.
- `reject`: target one active candidate and record why. It can never become
  current.
- `redo`: close the current round, inherit concise plain-language feedback,
  optionally advance DesignProfileV2 by one revision, and create exactly two
  new directions. At least one material part of node positions, groups, edge
  set, or layout strategy must change. A CSS-only change or reused topology is
  a contract failure.

Never overwrite a direction, round, or decision in place. Do not describe an
automated preview as user acceptance.
