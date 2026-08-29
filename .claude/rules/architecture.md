# Architecture rules

- `apps/*` holds every independently-deployable unit — one app per Lambda function or web app (`apps/web`, `apps/api`, `apps/ingestion`, `apps/processing`), each with its own `package.json` and `tsconfig.json` (extending root `tsconfig.base.json`). This is an npm workspaces monorepo — new deployables are added under `apps/` only when their iteration actually needs them, not pre-scaffolded.
- `packages/*` holds shared libraries only (`packages/domain`, `packages/llm`) — never something deployed directly. Domain logic lives under `packages/domain` and stays free of AWS SDK and provider SDK imports.
- External systems (feeds, LLM providers, AWS services) are reached only through adapters under `packages/*`.
- Application code never talks to Lambda/DynamoDB/etc. directly from domain logic — go through an adapter.

(This file is a stub — expand it with real boundaries as more of `apps/` and `packages/` are introduced in later iterations.)
