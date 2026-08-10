---
name: prd-to-plan
description: Turn a PRD into a phased implementation plan, where each phase is a GitHub sub-issue of the PRD issue. Use when user wants to break down a PRD, create an implementation plan, plan phases from a PRD, or mentions "tracer bullets".
---

# PRD to Plan

Break a PRD into phases. Each phase becomes a **sub-issue** of the PRD issue on GitHub. Each phase is a thin vertical slice through every layer, not a horizontal cut of one layer.

## Process

### 1. Locate the PRD

The PRD should already be a GitHub issue (created by `write-a-prd`). Confirm the issue number with the user. If the PRD only exists as a local file, ask the user to run `write-a-prd` to publish it first.

### 2. Explore the codebase

Understand the current architecture, existing patterns, and integration layers that the PRD touches.

### 3. Handle architectural decisions (ADRs)

Durable decisions (routes, schema shapes, auth approach, third-party boundaries) belong in ADRs — not inline in plan bodies.

- Scan the PRD body for existing ADR links (patterns like `./adr/NNNNN-...` or `ADR-NNNNN`). These are already captured; just reference them from the phases that need them.
- If planning work surfaces a durable decision that isn't yet captured, invoke the **`write-an-adr`** skill to create one. Most ADRs should have been written during `write-a-prd`; this step is a safety net for late-arriving decisions.
- After any new ADR is created, update the PRD issue body (`gh issue edit <N>`) to add the link.

### 4. Draft vertical slices

Break the PRD into tracer-bullet phases.

<vertical-slice-rules>
- Each slice is a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Do NOT name specific files or functions — they are likely to change during implementation
- Durable decisions live in ADRs and get linked, not restated
</vertical-slice-rules>

### 5. Quiz the user

Draft the plan as a local Markdown file at `./plans/<prd-slug>.md` (same slug as the PRD) so it can be reviewed before issues are created.

<plan-template>
# Plan: <Feature Name> (PRD #<N>)

> ADRs referenced: [ADR-00007](./adr/00007-...), [ADR-00008](./adr/00008-...)

## Phase 1: <Title>

**User stories**: <list from PRD>

### What to build

Concise description of the vertical slice — end-to-end behavior, not layer-by-layer.

### Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

---

## Phase 2: <Title>

...
</plan-template>

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Should any phases be merged, split, or reordered?

Iterate until approved.

### 6. Create sub-issues on GitHub

Once the plan is approved, create one GitHub issue per phase and link each as a sub-issue of the PRD.

For each phase, in order:

1. Create the phase issue via the API so you capture both `number` and database `id` in one call:

   ```
   gh api -X POST /repos/:owner/:repo/issues \
     -f title="Phase N: <description>" \
     -f body="<phase body>" \
     --jq '{number, id}'
   ```

2. Link the new issue as a sub-issue of the PRD using the captured `id`:

   ```
   gh api -X POST /repos/:owner/:repo/issues/<PRD_NUMBER>/sub_issues \
     -f sub_issue_id=<PHASE_ID>
   ```

**Phase issue body template**:

```
Part of #<PRD_NUMBER>

## What to build

<description>

## Acceptance criteria

- [ ] ...
- [ ] ...

## References

- [ADR-NNNNN: <title>](./adr/NNNNN-...)
```

**Titles** use plain phase numbers: `Phase 1: ...`, `Phase 2: ...`. When a later phase gets inserted between existing ones, use `Phase 2b: ...`, `Phase 2c: ...`. Do not use `Blocked by #N` links — order is conveyed by the sub-issue priority list (what GitHub's `/sub_issues` endpoint returns). Sub-issues are created in the intended execution order, and `do-work` picks the first open one in that list. When a phase is inserted later, reposition it with the sub-issues priority endpoint so the list order still matches execution order:

```
gh api -X PATCH /repos/:owner/:repo/issues/<PRD>/sub_issues/priority \
  -F sub_issue_id=<new-phase-db-id> -F after_id=<preceding-phase-db-id>
```

### 7. Clean up

Once all sub-issues exist and the user confirms, delete `./plans/<prd-slug>.md`. GitHub (the PRD issue + its sub-issues) is now the source of truth.
