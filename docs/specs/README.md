# Specifications

Human-owned, durable descriptions of **what** a feature must do and **which constraints apply**. No files, classes, or signatures — those belong in the plan.

## Workflow

```text
/write-spec  →  human edits, sets Status: Ready
/plan-feature NNN  →  docs/plans/NNN-*.plan.md, human edits, sets Status: Approved YYYY-MM-DD
/implement-feature NNN  →  branch, test-author writes tests, code, npm run check, reviewer agent, post-implementation notes
→  commit + PR  →  CI + Claude PR review  →  human merge
```

Status lifecycle: `Draft` → `Ready` → `Implemented`.

## Naming

`NNN-<kebab-slug>.md`, numbered sequentially. Its plan is `docs/plans/NNN-<kebab-slug>.plan.md`.

## Acceptance criteria format

Acceptance criteria are Gherkin scenarios in one fenced `gherkin` block:

- One `Scenario` per observable behavior. Its name is a short sentence and serves as the criterion's handle in the plan's "Acceptance criteria → tests" table.
- `Given` / `When` / `Then`, with `And` for extra steps. Use concrete example values where they make the behavior clearer.
- Use a `Scenario Outline` with an `Examples` table when the same behavior varies only by data.
- Describe behavior a test or person could observe, not internals: no file paths, type names or function names.

The Gherkin is a specification format, not executable: tests are written in Vitest, not Cucumber.

## Template

````markdown
# NNN — <Feature name>

Status: Draft

## Problem

Why this is needed, in two or three sentences.

## Acceptance criteria

```gherkin
Feature: <Feature name>

  Scenario: <One observable behavior, named as a short sentence>
    Given <the starting state or input>
    When <the action or event>
    Then <the observable outcome>
```

## Non-functional requirements

- Idempotency, timeouts, determinism, performance, etc.

## Constraints

- Architectural boundaries that apply (e.g. "domain logic only; no I/O").

## Out of scope

- What this spec deliberately does not cover, and which later spec will.

## Open questions

- Must be empty before Status: Ready.
````
