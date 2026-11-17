# Testing rules

- Business logic (domain code) requires unit tests; don't merge new logic without them.
- Prefer real behavior over mocks for internal collaborators; mock only true external boundaries (network, AWS, LLM providers).
- A failing test blocks the PR — do not weaken assertions to make CI pass.
- Test runner is Vitest. Tests live next to the code as `src/**/*.test.ts` in any workspace under `apps/` or `packages/`; the root `vitest.config.ts` picks them up.
- Every spec acceptance criterion maps to at least one named test (see the plan's "Acceptance criteria → tests" table).
- A test that proves a Gherkin scenario is named with the scenario name, verbatim, so `grep` finds it from the spec. For a `Scenario Outline`, use `it.each` over its `Examples` rows and append the row's values in parentheses, e.g. `Transient failures are retried at most twice (HTTP 429)`. Extra edge-case and NFR tests use their own descriptive names.
- Commands: `npm test` (unit tests), `npm run lint`, `npm run typecheck`, or `npm run check` for all three — the same gate CI runs.
- Workspaces expose a `typecheck` script (`tsc --noEmit`) so the root `npm run typecheck` covers them.
