---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

Ask questions **one at a time** using the `AskUserQuestion` tool so I can tap an answer instead of typing. For each question:

- Give it a short `header` chip (≤12 chars, e.g. "Auth", "Storage").
- Provide 2–4 mutually exclusive `options` with concise `label`s and a `description` explaining the trade-off.
- Put your recommended option **first** and append "(Recommended)" to its label.
- Use `multiSelect: true` only when choices genuinely aren't exclusive.
- Use `preview` when options differ in a way that's easier to see than describe (e.g. schema shape, code shape, layout) — skip it for pure preference questions.

Leave the question open enough that I'm picking from real alternatives, not rubber-stamping your answer. "Other" is always available for me to type a custom response, so don't pad with a filler option.

If a question can be answered by exploring the codebase, explore the codebase instead of asking.
