# Implementation plans

Agent-generated, human-approved implementation plans for specs in `docs/specs/`. Created by `/plan-feature NNN`, consumed by `/implement-feature NNN`.

- Name each plan after its spec: `docs/specs/002-rss-ingestion.md` → `docs/plans/002-rss-ingestion.plan.md`.
- `/implement-feature` refuses to run unless the header says `Status: Approved YYYY-MM-DD`. Only a human sets that.
- Plans are **dated snapshots**. They are not maintained after merge; the code and the spec are the source of truth.
- Fill in **Post-implementation notes** at PR time with deviations from the plan and why.
- Promote decisions that outlive the feature to an ADR in `docs/adr/`.

This practice is intended for the early iterations. See "Storing implementation plans" in `project-outline.md`.

## Template

```markdown
# Plan NNN — <feature name>

Status: Draft
Spec: docs/specs/NNN-<slug>.md

> Snapshot plan. Not maintained after merge. Code and spec are the source of truth.

## Approach

## Public interface

## Files to change

## Acceptance criteria → tests

| Criterion | Test |
|---|---|

## Dependencies

## Risks / open questions

## Post-implementation notes
```
