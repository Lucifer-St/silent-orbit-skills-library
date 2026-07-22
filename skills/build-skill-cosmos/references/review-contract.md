# Review and reporting contract

## Separate the decisions

Keep these questions independent:

1. Was the Skill observed successfully?
2. Who controls its update channel?
3. Is its authorship origin established?
4. May its sanitized metadata appear publicly?
5. Which functional categories describe it?

Category inference never grants publication. A successful scan never proves authorship. A source-managed update channel never authorizes an update.

## Ask for publication approval

Before the first generation or any changed public set, present a compact review grouped by:

- already public or creator-showcase records;
- new review-required records;
- local-only exclusions;
- source failures and diagnostics;
- proposed additions, changes, and removals.

Ask the user to choose exact decisions for unresolved records:

- `public`;
- `creator-showcase` with confirmed creator origin;
- `local-only`;
- keep `review-required`.

Accept grouped approval when the group and decision are explicit. Do not interpret “looks good,” a category choice, or silence as permission to publish. Preserve existing reviewed decisions when inputs are unchanged.

## Handle risk

Block generation when:

- a newly configured source failed unexpectedly;
- a removal is unexplained;
- a creator-showcase lacks creator evidence;
- diagnostics indicate private metadata or an invalid contract;
- the user has not confirmed a new or changed public boundary;
- `doctor` reports `error`.

Allow partial progress across other sources, but name the failed source label and safe diagnostic code. Never include raw provider output or local paths in the report.

Treat unknown providers and update channels as `unknown`; do not guess versions, ownership, or repair commands. Offer the next review action without installing or modifying anything.

## Explain analysis and diff

- Describe `inferred-rule` as a suggestion derived from visible taxonomy terms.
- Describe `curated-override` as a user-reviewed decision.
- Describe `review-required` as unresolved, even when the analyzer suggests a category.
- Report additions, changes, and removals separately.
- Treat an empty diff as evidence of an unchanged reviewed snapshot, not evidence that external sources are healthy; source state still comes from `scan`.

## Completion report template

```text
Project: <selected project>
CLI: silent-orbit <version>
Sources: <complete / partial / failed counts>
Inventory: <items>; public: <count>; review-required: <count>; local-only excluded: <count>
Review: <confirmed decisions and unresolved records>
Diff: <added / changed / removed>
Generation: <skills / categories / sources>; dist=<status>
Doctor: <ok / attention / error>
Risks: <safe diagnostics or none>
Boundaries: real Skills unchanged; no Obsidian/session reads; no GitHub/Netlify action
```

Keep reports concise and user-facing. Refer to private artifacts by role, not by dumping their contents.
