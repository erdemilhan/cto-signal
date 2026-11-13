# CTO Signal

@.claude/rules/architecture.md
@.claude/rules/testing.md
@.claude/rules/security.md

## Architecture

- TypeScript throughout
- React frontend
- Node.js Lambda backend
- API Gateway and DynamoDB
- AWS CloudFormation for all infrastructure

## Engineering principles

- Prefer simple solutions over abstractions.
- Put external APIs behind adapters.
- Put all LLM access behind packages/llm.
- Do not call provider SDKs from domain code.
- Add unit tests for business logic.
- Never commit secrets.
- Make infrastructure changes only through AWS CloudFormation.

## Feature workflow

Spec → plan → implement → review, one skill per step:

1. `/write-spec`: draft `docs/specs/NNN-*.md`; the human sets `Status: Ready`.
2. `/plan-feature NNN`: write `docs/plans/NNN-*.plan.md`; the human sets `Status: Approved YYYY-MM-DD`.
3. `/implement-feature NNN`: branch, implement, test, run the `reviewer` agent, record deviations.

Never write feature code without an approved plan. Never commit to `main`.

## Definition of Done

1. `npm run check` passes (lint, type checking, unit tests).
2. Every spec acceptance criterion has a test.
3. The `reviewer` agent has no unresolved blocker/major findings.
4. Plan post-implementation notes and relevant documentation are updated.
