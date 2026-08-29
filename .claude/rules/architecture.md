# Architecture rules

- Domain logic lives under `packages/domain`; keep it free of AWS SDK and provider SDK imports.
- External systems (feeds, LLM providers, AWS services) are reached only through adapters under `packages/*`.
- Application code never talks to Lambda/DynamoDB/etc. directly from domain logic — go through an adapter.

(This file is a stub — expand it with real boundaries as `apps/` and `packages/` are introduced in later iterations.)
