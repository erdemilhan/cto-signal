---
name: plan-feature
description: Use when the user asks to plan, analyze, or design the implementation of a spec in docs/specs/ (e.g. "plan spec 001"). Produces docs/plans/NNN-<slug>.plan.md for human approval. Never modifies source code.
---

# Plan feature

Input: a spec number or path (`$ARGUMENTS`). Output: one plan file awaiting human approval.

## Preconditions

- The spec exists and has `Status: Ready`. If it is `Draft`, stop and tell the user which open questions block it.
- If a plan already exists with `Status: Approved`, stop and ask before overwriting.

## Steps

1. Read the spec in full, then `CLAUDE.md` and `.claude/rules/*` (already in context) and `docs/adr/` if it exists.
2. Inspect the code the change will touch: existing workspaces under `apps/` and `packages/`, their `package.json`/`tsconfig.json`, and nearby tests. Don't plan against assumptions you could have checked.
3. List requirements that are unclear, contradictory, or untestable. If one blocks a sound plan, ask the user before writing it.
4. Write `docs/plans/NNN-<slug>.plan.md` using the template in `docs/plans/README.md`, with `Status: Draft`. The plan must contain:
   - **Approach**: the smallest design that satisfies the spec, and why. Name alternatives only if you rejected them for a reason the reviewer should know.
   - **Public interface**: the exported functions and types with their signatures, and the module path tests import them from. The `test-author` agent writes tests against this before any code exists, so it must be precise. Include the seams tests need to control external boundaries (e.g. an injectable fetch function).
   - **Files to change**: every file to create or modify, one line each on what changes. New workspaces must follow `.claude/rules/architecture.md`.
   - **Acceptance criteria → tests**: a table mapping *every* acceptance criterion and NFR in the spec to the test(s) that will prove it. A criterion with no test needs a stated reason.
   - **Dependencies**: any new npm package, with a one-line justification. Prefer none.
   - **Risks / open questions**.
   - **Post-implementation notes**: leave empty.
5. Stop. Summarize the plan in a few lines and ask the user to review, edit, and approve it by changing the header to `Status: Approved YYYY-MM-DD`. Then they run `/implement-feature NNN`.

## Do not

- Edit anything outside `docs/plans/`.
- Mark the plan approved yourself, even if the user says "looks good" in chat — ask them to edit the header, or edit it only when they explicitly tell you to approve it.
