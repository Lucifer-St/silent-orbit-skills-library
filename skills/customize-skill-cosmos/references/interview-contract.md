# Interview contract

Keep the first interview to six high-information prompts:

1. Two or three visual references and why they feel right.
2. One or two anti-references and what must be avoided.
3. Desired qualities or emotional tone.
4. Preferred information density and whether Map or Library should lead.
5. Typography and color/contrast intent.
6. Motion tolerance, accessibility needs, and mobile priority.

If a profile already exists, ask only what changed.

Convert the answers into DesignProfileV2:

- `references`
- `antiReferences`
- `qualities`
- `density`: `airy`, `balanced`, or `compact`
- `navigation`: `map-first`, `library-first`, or `balanced`
- `typography`: `editorial`, `technical`, or `humanist`
- `colorIntent`
- `motion`: `still`, `measured`, or `expressive`
- `accessibility.highContrast`
- `accessibility.reducedMotion`
- `accessibility.mobilePriority`

Save only this summary. Do not store raw interview turns, prompts, user
identity, browsing history, files, local paths, or source excerpts.

A revised profile keeps the same profile ID and `createdAt`, increments
`revision` by exactly one, and sets `updatedAt` to the redo decision time.
