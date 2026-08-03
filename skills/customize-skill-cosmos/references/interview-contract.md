# Interview contract

Run preflight before the interview. Then use the CLI's six persisted steps and
show exactly one question at a time. Every step must contain an everyday
question, two or three understandable examples, progress, and the explicit
escape `不知道、不确定或跳过也可以`. Accept vague natural language. Support
`back` to revisit the previous answer.

The six topics are expressed to the user as lived experience, not as design
fields:

1. Familiar pages or places that feel pleasant to use.
2. What usually makes a page annoying or tiring.
3. How the finished library should feel in daily use.
4. Whether they usually know what to find or prefer wandering, and how much
   should fit on screen.
5. What makes text and color comfortable to read.
6. How much movement feels comfortable and whether phone or desktop matters
   more.

Never ask a newcomer to select `layout`, `density`, `typography`, `motion`,
`shape`, schema values, or a digest. If a profile already exists, ask in plain
language what changed and still use the same normalization boundary.

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

The normalizer owns those professional values and must pair each inference
with a short explanation. Save only the normalized summary and explanations.
Do not store raw interview turns, prompts, user identity, browsing history,
files, local paths, or source excerpts.

Before confirmation, show a plain `我理解的是……` summary and invite correction.
Professional fields appear only in optional advanced output. No direction may
be prepared until all six steps are answered or skipped and the review is
explicitly confirmed.

A revised profile keeps the same profile ID and `createdAt`, increments
`revision` by exactly one, and sets `updatedAt` to the redo decision time.
