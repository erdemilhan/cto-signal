# CTO Signal: A Complete AI-Assisted Practice Project

## Project intent

CTO Signal is a deliberately small personal project for recreating, end to end, the way a modern AI-assisted software engineering organization should work.

The product must remain small and focused. Its value is not the number of features it accumulates; its value is the opportunity to refresh and connect the full engineering lifecycle:

- Git workflows
- A local Claude Code development environment
- Claude harness design using project instructions, rules, skills, agents, and hooks
- GitHub Actions for CI, deployment, and Claude-assisted pull-request review
- AWS serverless deployment and infrastructure as code
- LiteLLM as an LLM gateway, with routing, usage, cost, and latency monitoring
- Node.js and TypeScript application development
- Architecture documentation, ADRs, specifications, tests, and controlled delivery

The intended outcome is a CTO-sized reference implementation: small enough to complete personally, but realistic enough to expose the organizational choices, guardrails, trade-offs, and failure modes of an AI-assisted SDLC.

## Why CTO Signal instead of generic CRUD or a news aggregator?

A generic CRUD application mostly exercises forms, persistence, and API plumbing. A generic news aggregator can become a frontend project with little architectural depth.

CTO Signal creates natural reasons to use event-driven ingestion, queues, idempotency, external adapters, structured LLM outputs, model routing, cost attribution, observability, infrastructure as code, and AI-assisted engineering workflows—without inventing artificial complexity.

It is also personally useful. Instead of producing another demo database, it produces a concise view of developments in AI engineering, cloud, security, architecture, banking technology, and the software delivery lifecycle.

The key constraint is important: **build the smallest product that gives the engineering harness something real to operate on.**

## Product concept

CTO Signal ingests a small number of engineering, AI, and cloud sources; normalizes and deduplicates their stories; ranks their relevance; summarizes the most important items; and produces a five-minute daily CTO brief.

Start with only a few sources, for example:

- Hacker News
- AWS What's New
- Anthropic, OpenAI, and GitHub engineering updates

Each candidate item is evaluated into structured data:

```json
{
  "relevance": 87,
  "categories": ["AI Engineering", "SDLC"],
  "why_it_matters": "Introduces a policy-controlled capability for coding agents.",
  "summary": "The release adds a governed workflow for agent-assisted development.",
  "action": "Test it in the developer-agent pilot."
}
```

An example daily output:

```text
CTO SIGNAL — AUGUST 29

Critical signals
────────────────────────────────────────

92  Claude introduces policy-controlled agent workflows
    AI Engineering · Agentic SDLC

    Why it matters
    This changes how GitHub-based agents can be governed and may
    simplify the developer-agent pilot.

    Recommended action
    Run a small evaluation against the current PR workflow.

    [Read source] [Save]

84  AWS announces a serverless event-processing enhancement
    Architecture · Cloud

    Why it matters
    It could simplify failure handling in scheduled ingestion.

    Recommended action
    Compare it with the current EventBridge → SQS design.

FILTER
AI | AWS | Engineering | Security | Banking
```

That is enough product for the learning exercise.

## Initial AWS architecture

```text
                  ┌────────────────────────┐
                  │ RSS / APIs / Web feeds │
                  └────────────┬───────────┘
                               │
                      EventBridge schedule
                               │
                               ▼
                     ┌──────────────────┐
                     │ Ingestion Lambda │
                     └─────────┬────────┘
                               │
                              SQS
                               │
                    ┌──────────▼──────────┐
                    │ Processing Lambda   │
                    │ dedupe / normalize  │
                    └──────────┬──────────┘
                               │
                               ▼
                          DynamoDB
                               │
                    items requiring AI
                               │
                               ▼
                     ┌───────────────────┐
                     │   LiteLLM Proxy   │
                     └─────────┬─────────┘
                               │
                        Claude / OpenAI
                               │
                    score / tags / summary
                               │
                               ▼
                          DynamoDB
                               │
                 ┌─────────────▼──────────────┐
                 │ Node.js / React web app    │
                 │ “Today's five-minute brief”│
                 └────────────────────────────┘
```

Keep the first deployed version serverless. This refreshes IAM, Lambda, API Gateway, SQS, DynamoDB, EventBridge, CloudWatch, Secrets Manager, S3, CloudFront, and CloudFormation without creating an infrastructure operations project.

## The engineering harness is the real project

The application is the workload. The harness—the conventions and controls that turn intent into tested, reviewed, deployable software—is the actual experiment.

```text
cto-signal/
│
├── CLAUDE.md
├── README.md
├── package.json
│
├── apps/
│   ├── web/
│   ├── api/
│   ├── ingestion/
│   └── processing/
│
├── packages/
│   ├── domain/
│   └── llm/
│
├── infrastructure/
│   └── cloudformation/
│       ├── api.yaml
│       ├── ingestion.yaml
│       ├── frontend.yaml
│       └── parameters/
│
├── .claude/
│   ├── settings.json
│   ├── rules/
│   │   ├── architecture.md
│   │   ├── testing.md
│   │   └── security.md
│   ├── skills/
│   │   ├── implement-feature/
│   │   ├── review-pr/
│   │   ├── architecture-review/
│   │   └── deploy/
│   └── agents/
│       ├── reviewer.md
│       └── architect.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── claude-review.yml
│       └── deploy.yml
│
└── docs/
    ├── architecture.md
    ├── adr/
    ├── specs/
    └── plans/
```

`apps/*` is uniform: every independently-deployable unit lives there (one npm workspace per Lambda or web app), added only when its iteration needs it — not pre-scaffolded. `packages/*` is reserved for shared libraries that are never deployed on their own.

The harness separates five concerns:

```text
CLAUDE.md   “What should the agent know?”
Rules       “Which project conventions should guide its choices?”
Skills      “How should this type of work be performed?”
Agents      “Which specialist should perform or review the work?”
Hooks / CI  “What must happen, and what must be true?”
```

Instructions are soft governance. Deterministic restrictions and quality gates belong in hooks, repository settings, and CI.

---

# The 13-step learning path

## 1. Establish the local development environment

Use this toolchain:

```text
Mac → Git → GitHub → VS Code + terminal Claude Code
    → Node.js/TypeScript → AWS CloudFormation
```

Use Claude Code from the terminal deliberately. The point is to understand the harness, not only to experience inline AI assistance through an IDE.

Initialize the repository, start Claude Code, and generate an initial project guide:

```bash
claude-personal
/init
```

Then edit `CLAUDE.md` yourself and keep it short:

```markdown
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

## Definition of Done

1. Run lint.
2. Run unit tests.
3. Run type checking.
4. Update relevant documentation.
```

Claude Code has no built-in "rules directory" convention — a file under `.claude/rules/` is never read unless something pulls it in. The `@path` lines above are CLAUDE.md's import syntax; that's what actually loads `architecture.md`, `testing.md`, and `security.md` into context. Without the imports, those files are just unread documentation sitting next to the harness.

Also set up `.claude/settings.json` in this step for tool permissions (allow read-only git/npm commands, deny destructive ones like force-push or `rm -rf`) — see step 4 for the same file's `hooks` key. Keep `settings.json` committed and shared; personal overrides go in the gitignored `.claude/settings.local.json`.

The first lesson is that LLM instructions are a form of architecture governance—but are not enforcement by themselves. A second, related lesson: only what CLAUDE.md actually imports or what settings.json actually configures affects agent behavior — everything else is a file on disk. The Claude Code model you run interactively here (the developer plane) is also a separate choice from the models `packages/llm` routes to for the application at runtime (step 11-13) — don't let the two blur.

## 2. Work from specifications, not one-line prompts

Create a small specification for every meaningful feature:

```text
docs/specs/002-rss-ingestion.md
```

```markdown
# RSS ingestion

## Problem

Sources must be periodically ingested.

## Acceptance criteria

- Fetch an RSS feed.
- Normalize each article.
- Prevent duplicate ingestion.
- Persist accepted articles.
- Failure of one feed must not stop another.

## Non-functional requirements

- The operation must be idempotent.
- Requests time out after 10 seconds.
- Transient failures are retried.
```

Ask Claude to analyze before editing:

```text
Implement docs/specs/002-rss-ingestion.md.

First analyze the specification and existing architecture.
Propose an implementation plan.
Do not modify files until the plan is complete.
```

This creates the repeatable flow:

```text
SPEC → PLAN → IMPLEMENT → TEST → REVIEW → PR
```

### Specs versus plans

The spec is mostly functional, but not purely: it states **what** must be true and **which constraints apply** (problem, acceptance criteria, non-functional requirements, architectural boundaries, out of scope). It does not prescribe files, classes, or signatures. There is no separate hand-written "implementation spec" — the agent derives the implementation plan from the spec plus the repository, and the human reviews that plan before any code changes.

| Artifact | Author | Lifespan | Content |
|---|---|---|---|
| `docs/specs/NNN-*.md` | Human | Durable | What, why, acceptance criteria, constraints |
| `docs/plans/NNN-*.plan.md` | Agent, human-approved | Snapshot | Approach, files to change, test plan, risks |
| `docs/adr/NNN-*.md` | Human (agent may draft) | Durable | Cross-cutting architectural decisions |
| `.claude/rules/*`, `CLAUDE.md` | Human | Durable | Conventions that apply to every feature |

Rule of thumb: if it would still be true after a refactor, it belongs in the spec or an ADR; if not, it belongs in the plan.

### Storing implementation plans (early iterations)

In the early iterations, approved plans are committed to `docs/plans/`, named after their spec:

```text
docs/specs/002-rss-ingestion.md
docs/plans/002-rss-ingestion.plan.md
```

The purpose is learning, not documentation. Comparing the approved plan with the merged diff shows where the agent drifts, what it consistently misses, and which guidance belongs in `.claude/rules/`. It also gives PR reviewers a plan to check the diff against.

Plans are **dated snapshots and are not maintained after merge** — the code and the spec remain the source of truth:

```markdown
> Snapshot plan for spec 002, approved YYYY-MM-DD.
> Not maintained after merge. Code and spec are the source of truth.

## Approach
## Files to change
## Test plan
## Risks / open questions
## Post-implementation notes   ← filled at PR time: deviations from the plan and why
```

The post-implementation notes are the most valuable part: they record the gap between plan and reality.

Once plans rarely surprise you, stop committing them (or keep them only in PR descriptions). By then their lessons should have migrated into rules, skills, and ADRs. Decisions surfaced in a plan that outlive the feature are promoted to an ADR.

## 3. Turn the repeated workflow into a Claude skill

Create a reusable workflow:

```text
.claude/skills/implement-feature/SKILL.md
```

```markdown
---
name: implement-feature
description: Use when implementing a feature from a docs/specs/*.md file. Reads the spec, plans, implements the smallest viable change, tests, and reviews the diff.
---

# Implement feature

1. Read the specification.
2. Inspect the affected architecture and tests.
3. Identify unclear requirements and risks.
4. Write the implementation plan to docs/plans/NNN-<name>.plan.md and wait for approval.
5. Implement the smallest viable change.
6. Add or update tests.
7. Run tests, lint, and type checking.
8. Review the resulting diff.
9. Fill in the plan's "Post-implementation notes" with deviations and why.
10. Summarize changes, decisions, and residual risks.
```

The frontmatter isn't decoration — `description` is what Claude reads to decide whether this skill applies to the current request, so it drives auto-invocation. The skill is also always callable explicitly as `/implement-feature`.

The progression is:

```text
free-form developer
        ↓
project engineering harness
        ↓
repeatable approved workflows
        ↓
skills, agents, policies, and gates
```

This makes prompting part of the engineering system rather than an individual improvisation.

## 4. Add deterministic hooks

Use hooks for actions that must occur, not facts the model should merely remember.

```text
Claude changes a TypeScript file
              ↓
        PostToolUse hook
              ↓
       formatter + linter
```

```text
Claude attempts a dangerous command
              ↓
         PreToolUse hook
              ↓
             DENY
```

```text
Claude changes infrastructure/
              ↓
             hook
              ↓
   cfn-lint + validate-template
```

Hooks live in `.claude/settings.json` (the same file that holds tool permissions from step 1), keyed by event with a tool matcher:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "npm run lint:fix" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": ".claude/hooks/deny-dangerous.sh" }] }
    ]
  }
}
```

Start narrowly. Hooks should be quick, predictable, and explain failures clearly; keep the complete merge gate in CI.

## 5. Make GitHub the control plane

Follow a real delivery workflow even as a team of one:

```text
main
 │
 └── feature/rss-ingestion
          │
          ├── Claude-assisted implementation
          ├── local tests
          └── push
                 │
                 ▼
             GitHub PR
                 │
      ┌──────────┼───────────┐
      ▼          ▼           ▼
 lint/test    security     Claude
                           reviewer
      │          │           │
      └──────────┴───────────┘
                 │
               merge
                 │
               deploy
                 │
                 ▼
                AWS
```

Configure protected `main`, required pull requests, required CI, no force pushes, squash merge, and GitHub issues as work items. Do not let an agent commit directly to `main`.

## 6. Add CI and Claude pull-request review

Start with two workflows.

```text
ci.yml

PR opened or updated
        ↓
      npm ci
        ↓
lint → typecheck → unit tests
```

```text
claude-review.yml

PR opened or updated
        ↓
Claude reviews correctness, security, architecture,
error handling, tests, and unnecessary complexity
        ↓
targeted PR findings
```

Use a focused review instruction:

```text
Act as a senior staff engineer.

Do not merely summarize the PR. Report only findings that should
block or materially improve it.

For every finding provide:
- severity
- affected code
- why it matters
- recommended correction

Review against CLAUDE.md and docs/architecture.md.
```

This separates the roles:

```text
Claude developer → code → Claude reviewer
```

You can write `claude-review.yml` by hand as shown, or use Anthropic's maintained `claude-code-action` GitHub Action, which already implements PR-triggered review (and optionally implementation) — worth knowing it exists so hand-rolling it here is a deliberate choice for the learning value, not an accident of not knowing the shortcut.

The reviewer can still share model limitations with the implementer, so deterministic CI and human judgment remain necessary.

## 7. Add a specialist architecture agent

The general reviewer looks for bugs. The architecture agent looks only for:

```text
boundaries
coupling
AWS misuse
security
unnecessary dependencies
observability
cost
failure modes
```

```text
                 PR
                  │
          ┌───────┴────────┐
          │                │
    code reviewer      architect
          │                │
    correctness        boundaries
    tests              NFRs
    security           AWS design
          │                │
          └───────┬────────┘
                  ▼
             PR decision
```

Give the specialist isolated context and a narrow output contract. Like skills, agents are defined by frontmatter — `name`, `description` (when to invoke this agent), and optionally a restricted `tools` list and `model`:

```markdown
---
name: architect
description: Reviews PRs for architectural boundaries, coupling, AWS misuse, and NFRs. Use after the general code reviewer.
tools: Read, Grep, Glob
---
```

Restricting `tools` (e.g. read-only for a reviewer) is itself a guardrail — it's the difference between "an agent that critiques code" and "an agent that could also edit it." This is the first version of a miniature agentic engineering organization.

Do not begin with autonomous background routines. Learn in layers:

```text
Level 1  Local Claude Code
Level 2  Project rules, skills, and hooks
Level 3  GitHub Actions and Claude review
Level 4  Specialist agents
Level 5  Scheduled or autonomous background workflows
```

## 8. Build the application serverlessly

For the web path, use:

```text
Route 53
   │
CloudFront
   │
S3 / React UI
   │
API Gateway
   │
Lambda
   │
DynamoDB
```

For ingestion, use:

```text
EventBridge → Lambda → SQS → Lambda → DynamoDB
```

Avoid Kubernetes and avoid ECS initially. They would add operational surface area without advancing the core learning goal.

Design the processing Lambda for idempotency. Give failed items a bounded retry policy and a dead-letter queue. Record enough context to replay or diagnose a failed message.

## 9. Define all AWS infrastructure with CloudFormation

Adopt one absolute rule:

> Nothing is created manually except the minimum identity and security bootstrap.

Keep infrastructure as declarative CloudFormation templates in YAML, one stack per workload:

```text
infrastructure/cloudformation/
├── api.yaml
├── ingestion.yaml
├── frontend.yaml
└── parameters/
    └── dev.json
```

Use this progression locally and later in CI:

```bash
cfn-lint infrastructure/cloudformation/*.yaml
aws cloudformation package --template-file ingestion.yaml \
  --s3-bucket <artifact-bucket> --output-template-file packaged.yaml
aws cloudformation deploy --template-file packaged.yaml \
  --stack-name cto-signal-ingestion --no-execute-changeset
aws cloudformation execute-change-set --stack-name cto-signal-ingestion \
  --change-set-name <name>
```

`package` uploads Lambda bundles to S3 and rewrites code locations; a change set is the CloudFormation equivalent of a diff — review it before executing. Make the template change and its change set visible in pull requests. Apply least-privilege IAM per workload rather than using one broad application role.

## 10. Deploy from GitHub to AWS using OIDC

Do not store permanent AWS access keys in GitHub.

```text
GitHub Action
      │
      │ OIDC token
      ▼
    AWS STS
      │
      ▼
IAM deployment role
      │
      ▼
CloudFormation deploy
```

Restrict the role's trust relationship to the intended GitHub repository, branch, and environment. Separate deployment roles by environment when the project grows.

The delivery flow is now:

```text
Issue → Spec → Branch → Implementation → Tests → PR
      → AI review → Merge → OIDC → CloudFormation deploy → AWS
```

## 11. Introduce LLM access behind an application abstraction

Start with one provider so you understand the direct integration:

```text
Node application → Anthropic or OpenAI API
```

But keep provider code behind `packages/llm`. Domain code must not instantiate a provider SDK directly.

```typescript
type LlmTask =
  | "classification"
  | "article-ranking"
  | "short-summary"
  | "executive-synthesis";

const result = await llm.complete({
  task: "article-ranking",
  prompt,
  metadata: {
    feature: "daily-brief",
    source: article.source,
    environment: "prod"
  }
});
```

Require structured responses and validate them at the boundary:

```typescript
const ArticleAssessment = z.object({
  relevance: z.number().min(0).max(100),
  categories: z.array(z.string()),
  why_it_matters: z.string(),
  summary: z.string(),
  action: z.string()
});
```

This protects the rest of the application from both provider differences and malformed model output.

## 12. Add LiteLLM as the gateway and monitor LLM usage

Once the direct path works, refactor it:

```text
Node application
      │
      ▼
application LLM abstraction
      │
      ▼
LiteLLM gateway
   │        │
   ▼        ▼
Claude    OpenAI
```

Use the gateway for unified provider access, authentication, virtual keys, budgets, rate limits, routing, and spend tracking.

Record at least:

```text
request ID
feature and task
model and provider
input and output tokens
latency
estimated cost
success or failure
```

Create a small operational view:

```text
LLM Usage — This Month

Total cost                  $7.31
daily brief                 $4.80
ranking                     $1.23
categorization              $0.41
development                 $0.87

Claude                         68%
OpenAI                         32%
Cost per briefing            $0.19
```

Keep the developer and application usage planes distinct:

```text
DEVELOPER PLANE
You → Claude Code → supported Claude authentication

APPLICATION PLANE
CTO Signal → LiteLLM → provider APIs → metered API billing
```

A Claude or ChatGPT subscription should not be assumed to include application API usage.

## 13. Add intent-based routing and quality evaluation

Route by task intent rather than letting each feature choose an arbitrary model:

```text
TASK                     MODEL CLASS

classification           cheap / fast
article ranking          cheap / fast
short summary            mid-tier
executive synthesis      stronger
complex reasoning        strongest approved
```

```json
{
  "task": "article-ranking",
  "cost_center": "cto-signal",
  "environment": "prod"
}
```

```text
                         ┌─ low-cost model
                         │
Node → LiteLLM → policy router ── alternate provider
                         │
                         └─ stronger reasoning model
```

Then add a small versioned evaluation set. Include representative articles, expected categories, minimum relevance behavior, summary-quality criteria, and known adversarial or low-value inputs. Run it when prompts, models, or routing rules change.

Measure more than model quality:

- usefulness and factual grounding
- schema validity
- false-positive ranking rate
- latency and failure rate
- cost per accepted story
- cost per daily brief

This turns the project into an experiment for a larger question:

> How should an enterprise govern model selection, cost, and quality without letting every team choose arbitrary models and prompts?

---

# Suggested build iterations

Resist adding product features quickly. Each iteration should introduce one meaningful engineering capability.

| Iteration | Product capability | What you are really learning |
|---:|---|---|
| 0 | Hello world | Git, GitHub, Node.js, TypeScript |
| 1 | Show hard-coded articles | Local Claude Code harness |
| 2 | Fetch Hacker News or RSS | Lambda, adapters, testing |
| 3 | Store articles | DynamoDB and idempotency |
| 4 | Scheduled ingestion | EventBridge, SQS, retries, DLQ |
| 5 | AI summary | Provider API and structured outputs |
| 6 | Multi-model gateway | LiteLLM and provider abstraction |
| 7 | Usage dashboard | LLM observability and FinOps |
| 8 | CloudFormation deployment | Infrastructure as code |
| 9 | Automated deployment | GitHub Actions and AWS OIDC |
| 10 | Claude PR reviewer | Agentic CI |
| 11 | Project skills and hooks | Reusable AI engineering harness |
| 12 | Architecture reviewer | Specialist-agent SDLC |
| 13 | Prompt and model evals | AI quality engineering |

Every iteration follows the same lifecycle, even when the code change is small:

```text
Issue → Spec → Branch → Claude-assisted plan → Implementation
      → Tests → PR → AI review → Human decision → Merge → Deploy
```

## Practical sequencing

```text
Iteration 0–2   Local development and disciplined feature workflow
Iteration 3–4   Event-driven data foundation
Iteration 5–7   LLM capability, gateway, and visibility
Iteration 8–9   Repeatable AWS delivery
Iteration 10–12 AI-assisted review and engineering governance
Iteration 13    Evidence-based prompt and model evolution
```

Do not wait until the application is “finished” to add CI, documentation, or deployment. Those are the product of this learning project.

---

# Target architecture

```text
SOURCES AND INGESTION

RSS / APIs / feeds
        │
        ▼
EventBridge → ingestion Lambda → SQS → processing Lambda
                                            │
                                   dedupe / normalize
                                            │
                                            ▼
                                        DynamoDB


AI PROCESSING

DynamoDB item
      │
      ▼
packages/llm
      │  task + policy metadata
      ▼
LiteLLM gateway ── budget / routing / rate limits / telemetry
      │
      ├── Claude
      └── OpenAI
      │
      ▼
validated score / tags / summary / action
      │
      ▼
DynamoDB


EXPERIENCE

Route 53 → CloudFront → React application
                         │
                         ▼
                    API Gateway
                         │
                         ▼
                       Lambda
                         │
                         ▼
                     DynamoDB


DELIVERY AND GOVERNANCE

Issue → Spec → Branch → Claude Code → local hooks → GitHub PR
                                                   │
                             ┌─────────────────────┼──────────────────┐
                             ▼                     ▼                  ▼
                           CI tests          Claude review      architecture agent
                             └─────────────────────┼──────────────────┘
                                                   ▼
                                                merge
                                                   │
                                             GitHub OIDC
                                                   │
                                                   ▼
                                         CloudFormation deploy
                                                   │
                                                   ▼
                                                  AWS
```

## Core principle

**The app is intentionally small; the engineering system around it is intentionally complete.**

The goal is not to prove that an LLM can generate Node.js code. The goal is to experience, in one manageable project, how specifications, repository context, reusable skills, specialist agents, deterministic hooks, CI, pull-request review, infrastructure as code, cloud identity, LLM gateways, observability, routing policy, and evaluations work together.

If CTO Signal remains a modest five-minute briefing application while its delivery system becomes a clear, governed, measurable miniature of a modern engineering organization, the project has succeeded.
