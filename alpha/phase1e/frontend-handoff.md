# Frontend handoff

This directory is a functional reference preview, not a prescribed art direction.
Use your preferred frontend Skill and visual style to create a custom implementation from the public data contract.
The bundled Editorial Skill Atlas demonstrates the required interactions through an editorial Map, Library index, and article Detail view; it is not an official theme recommendation.

## Public inputs

- `site-data.json`: runtime-safe project, SiteManifestV1, and renderer view model.
- `site-data.json.project.renderer`: renderer identifier and default route.
- Do not read `.silent-orbit/`, installed Skill bodies, local paths, usage evidence, or private maintenance state.

## Required behavior

- Preserve search, category/source filtering, interactive Map and Library navigation, Skill detail, URL/history state, keyboard access, and mobile interaction.
- Keep public counts derived from the supplied membership data.
- Preserve `public` and `creator-showcase` records only; never invent publication approval.
- Build into a user-selected output directory and do not overwrite this reference preview without confirmation.

Reference renderer: reference-index (Editorial Skill Atlas functional preview)
Reviewed public Skills: 44
