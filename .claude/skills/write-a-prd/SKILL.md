---
name: write-a-prd
description: Write a PRD based on a detailed description of the problem and potential solutions. Publishes the PRD as a GitHub issue; durable architectural decisions get captured as ADRs via the write-an-adr skill.
---

This skill will be invoked when the user wants to create a PRD. You should go through the steps below. You may skip steps if you don't consider them necessary.

1. Ask the user for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

2. Explore the repo to verify their assertions and understand the current state of the codebase.

3. Interview the user relentlessly about every aspect of this plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. Ask the user one question at a time, and make sure you have a complete answer before moving on to the next question. Do not move on until you have a complete understanding of the problem and solution. This may take a long time, but it is critical to get right. The more time you spend here, the better the resulting PRD will be, and the smoother implementation will go.

4. Draft the PRD using the template below. Save it locally as `./prd/<prd-slug>.md` for review. Iterate with the user until they approve it. A local file is the right medium for review — easy to scan, easy to edit, not yet public.

5. Identify durable architectural decisions in the PRD. These are decisions whose cost of reversal is high: framework choices, schema shapes, auth strategy, URL patterns, third-party boundaries.

   For each durable decision:
   - If an existing ADR already covers it, link it in the PRD's **Architectural Decisions** section.
   - If no ADR covers it, invoke the **`write-an-adr`** skill to create one. Add the new link to the PRD.
   - If the user wants to defer the decision, note it in the PRD so it isn't lost.

   Non-durable implementation details (which module owns what, function signatures) stay in **Implementation Decisions** — they do not need ADRs.

6. Create a GitHub issue with the final PRD content (including ADR references). The issue title is the PRD title.

7. Once the issue exists, delete the local `./prd/<prd-slug>.md` file. The GitHub issue is now the source of truth, and `prd-to-plan` will read it from there.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Architectural Decisions

Links to ADRs that this PRD depends on or creates. Durable decisions live here as pointers — full context is in the ADR file itself.

- [ADR-NNNNN: <title>](./adr/NNNNN-<slug>.md)

## Implementation Decisions

Non-durable implementation decisions. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Schema changes (high-level; full schema decisions belong in an ADR)
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>
