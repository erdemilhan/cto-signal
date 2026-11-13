# Plan 001 — Article normalization and identity

Status: Approved 2026-11-13
Spec: docs/specs/001-article-normalization.md

> Snapshot plan. Not maintained after merge. Code and spec are the source of truth.

## Approach

Create the first shared library, `packages/domain`, containing pure functions only — no I/O, no clock, no third-party runtime dependencies.

**Public API** (exported from `packages/domain/src/index.ts`):

```ts
type RawArticle = {           // what a source adapter (spec 002) hands over
  sourceId: string;
  title?: string;
  link?: string;
  publishedAt?: string;       // any date string the source provides
  summary?: string;
};

type Article = {
  id: string;                 // sha256 hex of canonicalUrl
  sourceId: string;
  title: string;
  url: string;                // canonical URL
  publishedAt: string;        // ISO 8601 UTC, e.g. 2026-11-12T09:30:00.000Z
  summary?: string;
};

type RejectionReason = "missing-title" | "invalid-url";

normalizeArticle(raw, ingestedAt: Date):
  { ok: true; article: Article } | { ok: false; reason: RejectionReason }

normalizeArticles(raws, ingestedAt: Date):
  { accepted: Article[]; rejected: { item: RawArticle; reason: RejectionReason }[] }
```

**Rules, mapped to the spec:**

- *Title*: `trim` and collapse `\s+` to a single space; empty → `missing-title`.
- *URL*: parse with the WHATWG `URL` global (it already lowercases scheme/host and drops default ports). Reject if the link is missing, unparseable, or not `http:`/`https:` → `invalid-url`. Remove the hash, delete the query parameters whose lowercased name starts with `utm_` or appears in `TRACKING_PARAMS` (the spec's list), and strip one trailing `/` from any path other than `/`. Remaining parameters keep their original order. If no parameters are left, there's no dangling `?`.
- *Id*: `createHash("sha256").update(canonicalUrl).digest("hex")` from `node:crypto`. The input is only the canonical URL.
- *Date*: if `publishedAt` parses, use `toISOString()`. Otherwise use `ingestedAt.toISOString()`. **Determinism fix:** ISO-like date-times without a zone (`2026-11-12T09:30:00`, `2026-11-12 09:30`) are treated as UTC by appending `Z` before parsing, because JavaScript otherwise parses them in the machine's local zone (I checked: GMT+4 on this laptop vs UTC on CI). Future dates are accepted unchanged.
- *Summary*: remove `<script>`/`<style>` blocks with their contents, then all remaining tags. Decode the common entities (`&amp; &lt; &gt; &quot; &#39; &apos; &nbsp;` plus numeric `&#NN;`/`&#xNN;`). Collapse whitespace. Truncate to the first 2000 whitespace-separated words. An empty result means the field is omitted.
- *Batch*: map with `normalizeArticle`, keep the first article per id, and collect rejections with their raw item. Every item is processed independently, so one bad item can't stop the batch.

**Why regex HTML stripping instead of a parser:** summaries are display text, not rendered HTML, and the spec forbids dependencies without a justification. Regex stripping is good enough for feed summaries. It is not a sanitizer, so the UI must still escape this text when rendering it (see Risks).

**Module layout:** `packages/domain/src` is organized by concept, one subfolder per capability, so later iterations (storage keys, ranking, briefs) add folders rather than crowding one directory:

```text
packages/domain/src/
├── index.ts                  public API of the package (re-exports)
├── article.ts                shared types: RawArticle, Article (used by later capabilities too)
└── normalization/
    ├── index.ts              re-exports this capability's public functions
    ├── normalize-article.ts  normalizeArticle, normalizeArticles, RejectionReason
    ├── canonical-url.ts
    ├── text-normalize.ts
    ├── published-date.ts
    ├── *.test.ts             tests next to the file they cover
    └── fixtures/raw-articles.ts
```

`Article` and `RawArticle` sit at the top level, not in `normalization/`, because storage (003) and ranking will use them without depending on normalization. Code outside a capability folder imports it only through its `index.ts`.

**Source shapes checked (2026-11-13)** so the input contract isn't guessed:

| Source | Format | title | link | date | summary |
|---|---|---|---|---|---|
| HN `news.ycombinator.com/rss` | RSS 2.0, front page only (30 items) | entity-encoded (`&#x27;`) | external article URL | RFC 822, `+0000` | none: `<description>` is just an HTML `Comments` link to the HN thread |
| AWS What's New `/recent/feed/` | RSS 2.0 | plain | article URL | RFC 822, `GMT` | entity-escaped HTML, ~1.3k chars |

The spec settles on RSS for both sources; the HN JSON API is out of scope. Both feeds are RSS 2.0 with RFC 822 dates, so one adapter can serve both.

What follows for this spec: the normalizer stays source-agnostic, and the RSS adapter (spec 002) maps items onto `RawArticle`. That mapping owns these decisions:
- XML entity decoding of titles. The XML parser does this.
- Dropping HN's `Comments` description, which would otherwise become the summary "Comments".

HN's `<comments>` links (`news.ycombinator.com/item?id=…`) still show why non-tracking query parameters must be kept, if a later spec stores discussion links.

The fixtures are modelled on these real items *as an adapter would map them*. Raw XML/JSON samples belong to spec 002's adapter tests.

**Package resolution:** `packages/domain` has no build step yet. Its `exports` points at `./src/index.ts`. No consumer exists in this spec, and spec 002 will decide between bundling the Lambda with esbuild (which reads TS sources directly) and adding a build step.

## Files to change

| File | Change |
|---|---|
| `packages/domain/package.json` | New workspace `@cto-signal/domain`: `type: module`, `exports: ./src/index.ts`, `typecheck: tsc --noEmit` script. No dependencies. |
| `packages/domain/tsconfig.json` | Extends `../../tsconfig.base.json`, `types: ["node"]` (same as `apps/web`), includes `src/**/*.ts`. |
| `packages/domain/src/index.ts` | Re-exports `article.ts` types and `normalization/index.ts`. |
| `packages/domain/src/article.ts` | `RawArticle`, `Article` types only. |
| `packages/domain/src/normalization/index.ts` | Re-exports `normalizeArticle`, `normalizeArticles`, `RejectionReason`, `canonicalizeUrl`, `TRACKING_PARAMS`. |
| `packages/domain/src/normalization/normalize-article.ts` | `RejectionReason`, `normalizeArticle`, `normalizeArticles`. |
| `packages/domain/src/normalization/canonical-url.ts` | `TRACKING_PARAMS`, `canonicalizeUrl(link): string \| undefined`. |
| `packages/domain/src/normalization/text-normalize.ts` | `collapseWhitespace`, `htmlToText`, `truncateWords`. |
| `packages/domain/src/normalization/published-date.ts` | `parsePublishedAt` (zone-less ISO treated as UTC). |
| `packages/domain/src/normalization/fixtures/raw-articles.ts` | Sample raw items modelled on the captured HN RSS and AWS What's New items, plus the spec's malformed cases. Test-only; not exported. |
| `packages/domain/src/normalization/canonical-url.test.ts` | URL rules. |
| `packages/domain/src/normalization/text-normalize.test.ts` | Whitespace, HTML, truncation. |
| `packages/domain/src/normalization/published-date.test.ts` | Date parsing and UTC handling. |
| `packages/domain/src/normalization/normalize-article.test.ts` | Single-item and batch behavior using the fixtures. |
| `package-lock.json` | Updated by `npm install` to link the new workspace. |
| `.claude/rules/architecture.md` | Record that `packages/domain/src` is organized as one folder per capability (imported via its `index.ts`, shared types at the top level), and that workspace packages are consumed from TS source until a build step is chosen. |

Root `vitest.config.ts`, `eslint.config.js` and the `typecheck` script already pick up `packages/*` without changes.

## Acceptance criteria → tests

| Criterion (spec) | Test |
|---|---|
| A valid raw item normalizes to an article with id, sourceId, title, canonical URL, ISO UTC date, and optional summary | `normalize-article.test.ts` › "normalizes the HN RSS and AWS sample items into the full article shape" (checks exact objects, with and without a summary) |
| Title trimmed and whitespace collapsed | `text-normalize.test.ts` › "collapseWhitespace trims and collapses tabs/newlines/multiple spaces"; `normalize-article.test.ts` › "normalizes a messy title" |
| Empty title rejected with a reason | `normalize-article.test.ts` › "rejects missing, empty, and whitespace-only titles as missing-title" |
| URL: scheme/host lowercased | `canonical-url.test.ts` › "lowercases scheme and host but not path" |
| URL: fragment removed | `canonical-url.test.ts` › "removes the fragment" |
| URL: tracking parameters removed (`utm_*` and the listed trackers), case-insensitive | `canonical-url.test.ts` › "removes every utm_* parameter"; "removes each listed tracker" (`it.each` over `TRACKING_PARAMS`); "matches tracker names case-insensitively" |
| URL: non-tracking parameters kept (HN `item?id=`) | `canonical-url.test.ts` › "keeps non-tracking parameters, e.g. HN item ids"; "two HN items with different ids stay distinct" |
| URL: trailing slash removed from non-root paths only | `canonical-url.test.ts` › "strips the trailing slash from /a/b/ but keeps the root /" |
| URL missing, unparseable, or not http(s) → rejected | `canonical-url.test.ts` › "returns undefined for missing, unparseable, javascript:, ftp:, mailto: links"; `normalize-article.test.ts` › "rejects the javascript: link fixture as invalid-url" |
| Id derived only from the canonical URL; same story with different tracking params/fragments → same id | `normalize-article.test.ts` › "same story with different tracking parameters and fragment gets the same id"; "id is unaffected by title, summary, source, and date"; "id is the sha256 hex of the canonical URL" |
| Missing/unparseable date → ingestion time | `normalize-article.test.ts` › "falls back to ingestedAt when publishedAt is missing"; "… when publishedAt is unparseable" |
| Any parseable date accepted as is, including future dates | `published-date.test.ts` › "parses RFC 822 (RSS) and ISO 8601 dates to UTC ISO strings"; `normalize-article.test.ts` › "keeps a future publication date unchanged" |
| Summary: HTML removed, whitespace collapsed, empty → no summary | `text-normalize.test.ts` › "htmlToText strips tags, script/style contents, decodes entities"; `normalize-article.test.ts` › "HTML-heavy summary fixture becomes plain text"; "summary that is only tags/whitespace is omitted" |
| Summary truncated to 2000 words at a word boundary | `text-normalize.test.ts` › "truncateWords keeps exactly 2000 words of a 2500-word text"; "leaves a 2000-word text unchanged"; "never cuts a word in half" |
| Batch: duplicates removed, first occurrence kept | `normalize-article.test.ts` › "batch keeps the first of two items with the same canonical URL" |
| Batch: rejected items returned with reasons; one bad item doesn't stop the others | `normalize-article.test.ts` › "batch of mixed fixtures returns all valid articles and each rejected item with its reason" |
| NFR: deterministic | `normalize-article.test.ts` › "normalizing the same batch twice yields deep-equal output"; `published-date.test.ts` › "treats zone-less ISO date-times as UTC" (independent of `TZ`, since the expected value is a fixed UTC string) |
| NFR: no I/O, no direct clock | No runtime test. Enforced by design (time is a parameter) and verified in review: no `Date.now()`, `new Date()` without an argument, `fs`, `fetch`, or AWS imports in `packages/domain/src`. A lint rule could enforce this later (candidate harness improvement). |
| Constraint: no new runtime dependencies | Verified in review: `packages/domain/package.json` has no `dependencies`. |

## Dependencies

None. `node:crypto` and the `URL` global are built in.

## Risks / open questions

1. **Entity decoding goes slightly beyond the spec's wording** ("HTML tags removed"). Without it, summaries would show `&amp;`. I'm treating it as part of "HTML removed"; strike it if you disagree.
2. **Titles are not entity-decoded.** The live HN feed does encode titles (`&#x27;`), but any XML parser decodes them, so the adapter in spec 002 handles it. The normalizer follows the spec: trim and collapse only.
3. **Remaining near-duplicates get different ids**: `http` vs `https`, `www.` vs no `www.`, and differently ordered query parameters. The spec doesn't ask to merge them, so this plan doesn't. Revisit if spec 003 shows duplicates.
4. **`sourceId` is not validated.** The type requires a string, but an empty one is accepted. The spec has no rule for it.
5. **Ambiguous slash dates** (`12/11/2026`) parse as US month/day. That counts as "parseable, accepted as is" under the spec. Both RSS feeds use RFC 822, so this is low risk. *(Superseded during implementation; see post-implementation notes.)*
6. **The regex HTML stripping is not an XSS sanitizer.** Any UI that renders summaries must escape them. Note this for the web iteration.
7. **TS-source `exports`** works for tests and for an esbuild bundle, but not for running `tsc` output under plain `node`. Spec 002 decides how this is consumed.
8. **The adapter decisions listed under "Source shapes checked" are not tested here.** They are spec 002's responsibility and should appear in its acceptance criteria. Choosing RSS gives up HN's score and Ask/Show HN text posts, which only the API provides. Revisit if ranking needs the score.

## Post-implementation notes

Implemented 2026-11-13 on `feature/001-article-normalization`, stacked on `chore/harness-bootstrap`.

**Deviations from the plan**

1. **Date parsing is stricter than planned.** The plan only fixed zone-less *ISO* date-times. The reviewer showed that zone-less RFC 822 dates (`Thu, 12 Nov 2026 22:03:09`), and anything else going to V8's lenient parser, still depended on the machine's time zone. V8 also accepted junk such as `"Item 5"` (→ 2001-05-01). `parsePublishedAt` now accepts only ISO 8601 and RFC 822/1123, with zones limited to the ones V8 parses reliably (`UT`, `UTC`, `GMT`, `Z`, US zones, `±hhmm`). A missing zone is read as UTC. Everything else (slash dates, `Nov 12 2026`, `CEST`) falls back to `ingestedAt`. This narrows the spec's "any parseable date" to "any date in a feed date format". **Spec owner to confirm.**
2. **The test suite runs pinned to `TZ=Asia/Dubai`** (`vitest.config.ts`), with a guard test. CI runs in UTC, which would otherwise hide time-zone bugs. I checked that removing the zone-less handling makes the suite fail under a `TZ=UTC` shell.
3. **The query string is always re-serialized** with `URLSearchParams`, which the plan didn't spell out. The benefit: URLs that differ only in trackers produce identical ids, even when the remaining parameters were encoded differently (`%20` vs `+`). The cost: `?foo` becomes `?foo=` and `%20` becomes `+` in the stored URL. Accepted, because id stability is what the spec requires.
4. **Unclosed `<script>`/`<style>` blocks are dropped to the end of the input**, since truncated feed descriptions can cut HTML mid-element. Not in the plan; added after review.
5. **The public API also exports the `NormalizeResult` and `BatchResult` types**, so callers can name the return types.
6. **Impossible calendar dates are rejected** (`2026-02-31`, `31 Feb 2026`). JavaScript would otherwise roll them over to 3 March. Added after review round 2.
7. **Date parsing removed entirely; this supersedes 1, 2 and 6.** After review, the spec owner decided dates are stored and displayed as the feed's own text. The spec was updated to match. `publishedAt` is now the trimmed source text and is omitted when blank, there's no `ingestedAt` parameter, and `published-date.ts`, its tests and the `TZ` pin in `vitest.config.ts` are deleted. This makes the time-zone work above moot. Sorting or filtering by date (e.g. "today's brief") will need a real timestamp later, probably the ingestion time recorded by storage (spec 003). This simplification came after the two allowed review rounds and was not reviewed again.

**Review**

Round 1: changes-requested, 2 major and 4 minor findings. Both majors (time-zone-dependent dates; a determinism test CI couldn't fail) are fixed by deviations 1 and 2. Minors: junk dates (fixed by 1), URL re-encoding (recorded as 3), unclosed script (fixed by 4), and this plan's risk numbering and empty notes (fixed).

Round 2: approve, with 3 minor findings. Impossible dates are fixed (deviation 6). The spec still reads "any parseable date" and waits for the spec owner to confirm deviation 1. The `.gitignore` `.vscode/` line is the user's own edit, so it was left out of this change.

**Lessons for the harness**

- *Candidate rule (testing.md), if parsing dates ever returns:* time-dependent logic must be tested in a non-UTC zone. CI's UTC default hides that whole class of bug.
- *Plan-skill gap:* the plan named the right NFR (determinism) and a fix, but checked only one input format. `/plan-feature` could ask "for each NFR, which inputs could violate it?" rather than only "which test proves it?".
- *Workflow:* the reviewer caught real bugs that 59 passing tests missed. Its value came from running code under conditions the implementer hadn't tried.
- *Process:* the biggest simplification came from the spec owner, not the plan or the review. Two rounds were spent hardening a requirement ("parse dates") the product didn't need. `/write-spec` could ask "does the product need this transformed, or only kept?" for each field.
