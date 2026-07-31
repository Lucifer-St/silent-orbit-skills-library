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
and accent. Two palettes on the same structure are not two directions.

Each direction needs a short label and rationale tied to the DesignProfileV2.
Do not invent product claims, navigation, metrics, or content.

## Decisions

- `keep`: only an active candidate may be selected. It becomes current; other
  active directions become superseded.
- `adjust`: target one active candidate, preserve it as superseded, and create
  a child revision from precise feedback. A previously rejected alternative
  stays rejected.
- `reject`: target one active candidate and record why. It can never become
  current.
- `redo`: close the current round, inherit concise feedback, optionally
  advance the DesignProfileV2 one revision, and create exactly two new
  directions.

Never overwrite a direction, round, or decision in place. Do not describe an
automated preview as user acceptance.
