# CTO Signal

@.claude/rules/architecture.md
@.claude/rules/testing.md
@.claude/rules/security.md

## Architecture

- TypeScript throughout
- React frontend
- Node.js Lambda backend
- API Gateway and DynamoDB
- AWS CDK for all infrastructure

## Engineering principles

- Prefer simple solutions over abstractions.
- Put external APIs behind adapters.
- Put all LLM access behind packages/llm.
- Do not call provider SDKs from domain code.
- Add unit tests for business logic.
- Never commit secrets.
- Make infrastructure changes only through CDK.

## Definition of Done

1. Run lint.
2. Run unit tests.
3. Run type checking.
4. Update relevant documentation.
