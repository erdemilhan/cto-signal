---
name: implement-feature
description: Use when the user asks to implement a spec whose plan in docs/plans/ is approved (e.g. "implement 001"). Implements the approved plan, tests it, runs the reviewer agent, and records deviations. Refuses to start without an approved plan.
---

# Implement feature

Input: a spec number (`$ARGUMENTS`).

## Gate

Read `docs/plans/NNN-*.plan.md`. Proceed only if its header says `Status: Approved <date>`. Otherwise stop and point the user to `/plan-feature NNN`. No exceptions — this gate is what makes the workflow repeatable.

## Steps

1. **Branch.** If on `main`, create `feature/NNN-<slug>`. Never commit to `main`.
2. **Read** the spec and the approved plan. The plan is the contract; the spec wins if they disagree.
3. **Implement** the smallest change that satisfies the plan. Follow `CLAUDE.md` and `.claude/rules/*`. If you must deviate from the plan (a file, an approach, a dependency), keep going only if the deviation is minor and note it; if it changes the design, stop and ask.
4. **Test.** Write the tests listed in the plan's acceptance-criteria table. Test real behavior; mock only true external boundaries.
5. **Verify.** Run `npm run check` (lint → typecheck → test). Fix until it passes. Never weaken or delete an assertion to make it pass.
6. **Review.** Invoke the `reviewer` agent with: the spec path, the plan path, and the base branch (`main`). Then:
   - Fix every `blocker` and `major` finding, re-run `npm run check`, and re-run the reviewer once.
   - If a finding is wrong, don't fix it — record why in the post-implementation notes.
   - Stop after two review rounds; report anything unresolved instead of looping.
7. **Record.** Fill in the plan's **Post-implementation notes**: deviations from the plan and why, review findings and how each was resolved, and anything the harness should learn (a candidate rule, skill change, or ADR).
8. **Docs.** Update docs that the change made stale (README, `docs/architecture.md`, rules). Set the spec to `Status: Implemented`.
9. **Summarize** for the user: what changed, test evidence (the `npm run check` result), review outcome, residual risks. Offer to commit and open a PR; do so only when they say yes. The PR description links the spec and plan.
