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

They consume only `site-data.json`, `frontend-handoff.v2.json`, and the
additive `customization-experience.v3.json`. Existing v1/v2 schemas and sidecar
digests stay frozen; v3 is an explicit companion, not a silent v2 rewrite.

`CustomizationExperienceV3` separates:

- `preferredView`, the confirmed default used on first open, refresh, mobile,
  and selected current output;
- explicit URL/runtime view, which wins after a user intentionally switches
  and is never forced back during that interaction;
- public-safe map structure: groups, nodes, membership-only edges, layout
  strategy, and `structureDigest`;
- surface identity, tracked independently through the existing style digest.

`library-first` must render Library before script execution and after an
unqualified refresh. `map-first` must render Map. An explicit `#view=...` may
override the preference without mutating it.

The frozen v2 refresh allowlist still owns only these two generated-data files:

```text
site-data.json
frontend-handoff.v2.json
```

HTML, CSS, JavaScript, fonts, and direction metadata remain style-owned. The v3
experience companion is regenerated separately from the new public site data,
preserving the preferred view and style digest while deriving safe new groups,
nodes, and membership edges. It may not inspect Skill bodies or private state.
`customize refresh` must stage the selected frontend, update the v2 allowlist,
rederive the v3 structure, validate snapshot binding, prove the style digest is
unchanged, and only then replace `customization/current/`.

If the handoff is missing, stale, incompatible, private, or the style digest
has drifted, stop without changing current output. Never silently regenerate
the visual layer.
