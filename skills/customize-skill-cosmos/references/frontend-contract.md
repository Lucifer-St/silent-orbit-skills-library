# Frontend and refresh contract

The candidate and selected frontends preserve the full generated functional
contract:

- search
- Category and Source filters
- Map and Library navigation
- Skill Detail
- URL and browser history state
- keyboard access
- mobile interaction
- empty state and derived result counts
- locale switching
- reduced motion

They consume only `site-data.json` and `frontend-handoff.v2.json`.

The CLI owns only these two managed files during refresh:

```text
site-data.json
frontend-handoff.v2.json
```

HTML, CSS, JavaScript, fonts, direction metadata, and other style/source files
are style-owned. `customize refresh` must stage the selected frontend, update
the two managed files, validate their snapshot binding, prove the style digest
is unchanged, and only then replace `customization/current/`.

If the handoff is missing, stale, incompatible, private, or the style digest
has drifted, stop without changing current output. Never silently regenerate
the visual layer.
