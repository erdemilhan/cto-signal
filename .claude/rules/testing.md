# Testing rules

- Business logic (domain code) requires unit tests; don't merge new logic without them.
- Prefer real behavior over mocks for internal collaborators; mock only true external boundaries (network, AWS, LLM providers).
- A failing test blocks the PR — do not weaken assertions to make CI pass.
- Test runner is Vitest. Tests live next to the code as `src/**/*.test.ts` in any workspace under `apps/` or `packages/`; the root `vitest.config.ts` picks them up.
- Every spec acceptance criterion maps to at least one named test (see the plan's "Acceptance criteria → tests" table).
- Commands: `npm test` (unit tests), `npm run lint`, `npm run typecheck`, or `npm run check` for all three — the same gate CI runs.
- Workspaces expose a `typecheck` script (`tsc --noEmit`) so the root `npm run typecheck` covers them.
