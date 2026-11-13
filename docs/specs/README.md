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

## Template

```markdown
# NNN — <Feature name>

Status: Draft

## Problem

Why this is needed, in two or three sentences.

## Acceptance criteria

- One observable, testable behavior per bullet.

## Non-functional requirements

- Idempotency, timeouts, determinism, performance, etc.

## Constraints

- Architectural boundaries that apply (e.g. "domain logic only; no I/O").

## Out of scope

- What this spec deliberately does not cover, and which later spec will.

## Open questions

- Must be empty before Status: Ready.
```
