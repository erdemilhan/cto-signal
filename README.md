# CTO Signal

A small app that turns a few engineering, AI, and cloud feeds into a five-minute daily brief. It exists mainly to exercise the engineering system around it: an AI-assisted SDLC with specs, plans, agent skills, review agents, CI, and AWS infrastructure as code.

> **The app is intentionally small; the engineering system around it is intentionally complete.**
> The full intent, architecture, and learning path are in [`project-outline.md`](project-outline.md).

## Status

| Iteration | Capability | State |
|---|---|---|
| 0 | Hello world, monorepo, TypeScript | Done |
| 1 | Article normalization and identity ([spec 001](docs/specs/001-article-normalization.md)) | Done |
| 2 | RSS ingestion (Hacker News, AWS What's New) | Next |

Later iterations add storage, scheduled ingestion, LLM summaries, a LiteLLM gateway, CloudFormation deploys, and evals. See [Suggested build iterations](project-outline.md#suggested-build-iterations).

## Getting started

Requires Node.js 26 (pinned in [`.nvmrc`](.nvmrc)).

```bash
npm ci
npm run check      # lint → typecheck → unit tests (the same gate CI runs)
```

| Script | What it does |
|---|---|
| `npm run check` | Runs lint, typecheck, and tests. |
| `npm test` | Runs the Vitest unit tests. |
| `npm run lint` | Runs ESLint (typescript-eslint). |
| `npm run typecheck` | Runs `tsc --noEmit` in every workspace. |
| `npm run dev:web` | Runs the `apps/web` placeholder. |

## Repository layout

```text
apps/                 deployable units, one per Lambda or web app (added when an iteration needs one)
  web/                placeholder web app
packages/             shared libraries, never deployed on their own
  domain/             pure domain logic, no I/O or SDKs
    src/article.ts      shared Article / RawArticle types
    src/normalization/  canonical URL, id, text cleanup, batch normalization
docs/
  specs/              what to build (human-owned)
  plans/              how it was built (agent-written, human-approved snapshots)
.claude/
  rules/              architecture, testing, and security conventions (imported by CLAUDE.md)
  skills/             write-spec, plan-feature, implement-feature
  agents/             test-author, reviewer
.github/workflows/    CI, Claude PR review, Claude assistant
```

`infrastructure/` (CloudFormation) and the other apps arrive in later iterations.

## How features are built

Every feature follows the same cycle. Each step is a Claude Code skill or agent, and there are human gates between them:

```text
/write-spec          → docs/specs/NNN-*.md          human sets Status: Ready
/plan-feature NNN    → docs/plans/NNN-*.plan.md     human sets Status: Approved YYYY-MM-DD
/implement-feature NNN
   ├─ test-author agent writes acceptance tests from the spec (before any code)
   ├─ implement until npm run check passes
   ├─ reviewer agent: verdict + findings (max two rounds)
   └─ post-implementation notes: deviations from plan, lessons for the harness
→ PR → CI + Claude review → human merge
```

- **The spec says what; the plan says how.** Specs are durable. Plans are dated snapshots, and their post-implementation notes record where reality differed from the plan.
- **`/implement-feature` refuses to start** unless the plan header reads `Status: Approved <date>`.
- **The test-author and reviewer run as separate agents with their own context.** They judge the work without having written it.
- **Start a new Claude Code session for each spec.** The repo files are the handoff between sessions.

Conventions live in [`CLAUDE.md`](CLAUDE.md) and [`.claude/rules/`](.claude/rules/). Harness improvements are tracked as GitHub issues prefixed `harness:`.

## Principles

- TypeScript throughout, in an npm workspaces monorepo.
- External systems (feeds, LLM providers, AWS) are reached only through adapters, and all LLM access goes through `packages/llm`.
- Infrastructure is defined only in AWS CloudFormation. GitHub deploys to AWS via OIDC, with no long-lived keys.
- No secrets in git.
