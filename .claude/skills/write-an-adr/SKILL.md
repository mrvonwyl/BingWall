---
name: write-an-adr
description: Capture a durable architectural decision as ./adr/<NNNNN>-<slug>.md. Use when the user or another skill needs to record a decision about framework choice, schema shape, auth strategy, URL patterns, third-party boundary, or any other commitment whose cost of reversal is high. Callable directly by the user or by other skills (write-a-prd, prd-to-plan).
---

# Write an ADR

Architecture Decision Records capture durable decisions — the kind that shape the code for a long time and are painful to reverse.

## When to use

- Framework / library choice
- Data model or schema shape
- Auth / authorization approach
- URL / route patterns
- Third-party service boundaries
- Any decision where reversing it later would cascade through the code

Non-durable implementation details (which module owns what, specific function signatures) do NOT belong in an ADR. They live in PRDs, plan phases, or the code itself.

## Process

### 1. Understand the decision

Ask the user (or caller) for:

- **What** is being decided — stated as a single sentence
- **Forces** — requirements, constraints, non-negotiables driving the decision
- **Alternatives** considered and why each lost

If invoked by another skill, most of this context arrives in the invocation. Verify it is complete before drafting.

### 2. Check for overlap with existing ADRs

List `./adr/*.md` (create the directory if it does not exist). If any existing ADR covers the same territory:

- If the existing ADR is still correct, link it instead of writing a new one and stop here.
- If the existing ADR is outdated or wrong, the new ADR **supersedes** it. Note which one.

### 3. Pick the next number

Scan filenames in `./adr/`. Find the highest 5-digit prefix, increment by 1. The first ADR is `00001`. Numbers are global across the repo and never reused.

### 4. Draft using the template

<adr-template>
# ADR-NNNNN: <Title>

- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Supersedes**: ADR-NNNNN (only if replacing a prior ADR; omit otherwise)

## Context

Why this decision is needed. What forces are at play. What would go wrong without a decision.

## Decision

What we decided. State it crisply — one or two sentences.

## Consequences

What becomes easier. What becomes harder. What we are now locked into. What future work this enables or forecloses.

## Alternatives considered

What else was on the table and why each lost.
</adr-template>

### 5. Review with the user

Show the draft. Iterate until approved. Durable decisions deserve the interview time.

### 6. Save

Write to `./adr/<NNNNN>-<slug>.md`, where `<slug>` is kebab-case of the title (e.g., `00007-use-sqlite-for-job-queue.md`).

### 7. Supersession bookkeeping

If this ADR supersedes an older one, edit the older ADR:

- Change its **Status** from `Accepted` to `Superseded`
- Add a line: `- **Superseded by**: ADR-NNNNN (YYYY-MM-DD)`

Do not delete or rewrite the older ADR — history matters.

### 8. Return the reference

When invoked by another skill, return the ADR number and file path so the caller can link it (for example, in a PRD issue body or plan phase body).
