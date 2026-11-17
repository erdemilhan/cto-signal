# Plan 002 — RSS ingestion

Status: Approved 2026-11-17
Spec: docs/specs/002-rss-ingestion.md

> Snapshot plan. Not maintained after merge. Code and spec are the source of truth.

## Approach

Two new workspaces, following `.claude/rules/architecture.md`:

- **`packages/feeds`** (`@cto-signal/feeds`): the RSS adapter, a shared library. `parseRssItems` turns an RSS document into `RawArticle[]`. `fetchFeed` fetches one feed with the timeout and retry policy, then parses it. It never throws; every outcome comes back as a result value. It knows nothing about normalization or files.
- **`apps/ingestion`**: the runnable unit. It holds the fixed feed list with each feed's item limit, plus `runIngestion`, which fetches all feeds, normalizes each feed's items with `normalizeArticles` from `@cto-signal/domain` (unchanged), writes the JSON file and returns a report. A thin `main.ts` wires real `fetch` and the output folder, then prints the report. It's started with `npm run ingest`.

`packages/domain` is untouched and stays free of I/O.

**Fetching** (`fetchFeed`):
- Uses the injected `fetch`, with an `AbortController` aborted by `setTimeout` after `FETCH_TIMEOUT_MS = 10_000`. The timer covers the request *and* reading the body. I use `setTimeout` rather than `AbortSignal.timeout`, so Vitest fake timers control it and tests don't wait 10 real seconds.
- Classification:
  - Transient: `fetch` rejects (network error); our abort fires (timeout); status 429 or 5xx.
  - Permanent: any other non-2xx status; a body that fails XML validation (`invalid-xml`); valid XML without `rss > channel` (`not-rss`).
- Transient failures are retried after `RETRY_DELAYS_MS = [1_000, 2_000]`, so `MAX_ATTEMPTS = 3`. Permanent failures return right away. Redirects are followed by `fetch` (neither feed redirects today; checked 2026-11-17).

**Parsing** (`parseRssItems`): `fast-xml-parser` with `XMLValidator.validate` first. Options:
- `parseTagValue: false`, so a title like `2048` stays a string.
- `isArray` for `rss.channel.item`, so a one-item feed still gives an array.
- `htmlEntities: true`, so numeric entities like `&#x27;` decode.
- Raised entity limit (see Risks).

Each item maps to `{ sourceId, title, link, publishedAt: pubDate, summary: description }`, and other item fields are dropped. When `source.ignoreDescription` is set (Hacker News), `summary` is left out. Missing elements become `undefined`, and normalization then rejects or omits them per spec 001.

**Running** (`runIngestion`):
1. Records `startedAt` from the injected clock.
2. Fetches every feed concurrently (`Promise.all` over `fetchFeed`, which never rejects, so one feed can't stop another).
3. Keeps the first `maxItems` of each successful feed's items, in feed order, and counts the rest as dropped. The limit lives in `apps/ingestion` rather than the adapter, because it is an ingestion policy (bounding storage and later LLM work), not part of reading RSS.
4. Normalizes each feed's kept items separately, so per-feed counts are exact.
5. Merges the accepted articles across feeds in feed-list order, keeping the first article per id.
6. Writes them as a JSON array (pretty-printed) to `<outputDir>/<startedAt>.json`. The ISO time has `:` and `.` replaced by `-`, e.g. `2026-11-17T16-03-01-123Z.json`, because colons are awkward in file names. It creates `outputDir` if missing, and writes the file even when every feed failed (an empty array), so each run leaves a record.
7. Returns a `RunReport`.

`main.ts` prints `formatReport(report)`. It exits 1 only when every feed failed, otherwise 0. The spec doesn't cover exit codes; this is a convenience for later scheduling, not a criterion.

**Feed list** (fixed in code, in `apps/ingestion/src/feeds.ts`, which is also where the limit is configured):

| Source id | URL | ignoreDescription | maxItems |
|---|---|---|---|
| `hacker-news` | `https://news.ycombinator.com/rss` | yes | `DEFAULT_MAX_ITEMS` (50) |
| `aws-whats-new` | `https://aws.amazon.com/about-aws/whats-new/recent/feed/` | no | `DEFAULT_MAX_ITEMS` (50) |

Today HN serves 30 items (none dropped) and AWS 100 (50 dropped).

**Source shapes checked (2026-11-17)**:
- HN: RSS 2.0, 30 items. Each has `title` (with entities such as `&#x27;`), `link`, `pubDate`, `comments`, and a `description` that is a CDATA `Comments` link.
- AWS: RSS 2.0, 100 items. Each has `guid`, `title`, `description` (entity-escaped HTML, ~2,800 entities across the feed), `pubDate` and `category`.

Both parse correctly with the options above (checked against the live captures).

## Public interface

`@cto-signal/feeds`, imported from `packages/feeds/src/index.ts`:

```ts
import type { RawArticle } from "@cto-signal/domain";

export type FeedSource = {
  id: string;                  // becomes RawArticle.sourceId
  url: string;
  ignoreDescription?: boolean; // true → items get no summary
};

export type FeedFailure =
  | { kind: "network"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "invalid-xml"; message: string }
  | { kind: "not-rss"; message: string };

export type FetchFeedResult =
  | { ok: true; items: RawArticle[] }
  | { ok: false; failure: FeedFailure };

export const FETCH_TIMEOUT_MS: 10_000;
export const RETRY_DELAYS_MS: readonly [1_000, 2_000];
export const MAX_ATTEMPTS: 3;

/** Throws RssParseError (kind "invalid-xml" | "not-rss") on bad input. */
export function parseRssItems(xml: string, source: FeedSource): RawArticle[];
export class RssParseError extends Error {
  readonly kind: "invalid-xml" | "not-rss";
}

/** Never rejects. `fetch` is required, so tests cannot reach the network by accident. */
export function fetchFeed(
  source: FeedSource,
  deps: { fetch: typeof globalThis.fetch },
): Promise<FetchFeedResult>;
```

`apps/ingestion`, imported from `apps/ingestion/src/run-ingestion.ts` and `apps/ingestion/src/feeds.ts`:

```ts
import type { FeedSource, FeedFailure } from "@cto-signal/feeds";
import type { RejectionReason } from "@cto-signal/domain";

export const DEFAULT_MAX_ITEMS: 50;

export type IngestionFeed = FeedSource & {
  maxItems: number; // keep at most this many items, in feed order
};

export const FEEDS: readonly IngestionFeed[]; // the table above, in that order

export type FeedReport =
  | {
      sourceId: string;
      status: "ok";
      itemsRead: number;     // items in the feed
      itemsDropped: number;  // items beyond maxItems, not normalized
      accepted: number;   // after normalization, before cross-feed dedupe
      rejected: { title?: string; link?: string; reason: RejectionReason }[];
    }
  | { sourceId: string; status: "failed"; failure: FeedFailure };

export type RunReport = {
  startedAt: string;       // ISO 8601
  outputFile: string;      // absolute path of the JSON file written
  articlesWritten: number;
  feeds: FeedReport[];     // in feed-list order
};

export function runIngestion(deps: {
  fetch: typeof globalThis.fetch;
  outputDir: string;
  now?: () => Date;               // default: () => new Date()
  feeds?: readonly IngestionFeed[];  // default: FEEDS
}): Promise<RunReport>;

export function formatReport(report: RunReport): string;
```

Test seams: the injected `fetch` (a stub that routes by URL); fake timers for the 10 s timeout and the backoff; `now` for the file name; and a temporary `outputDir` (`fs.mkdtemp` under `os.tmpdir()`, so real files, no fs mocking).

## Files to change

| File | Change |
|---|---|
| `packages/feeds/package.json` | New workspace `@cto-signal/feeds`: `type: module`, `exports: ./src/index.ts`, `typecheck` script. Dependencies: `@cto-signal/domain: "*"`, `fast-xml-parser: "^4.5.7"`. |
| `packages/feeds/tsconfig.json` | Extends the base config, `noEmit`, `types: ["node"]`, includes `src/**/*.ts`. No `rootDir`, because it imports another workspace's sources. |
| `packages/feeds/src/index.ts` | Re-exports the public interface above. |
| `packages/feeds/src/parse-rss.ts` | `parseRssItems`, `RssParseError`. |
| `packages/feeds/src/fetch-feed.ts` | `fetchFeed`, the constants, `FeedSource`, `FeedFailure`, `FetchFeedResult`. |
| `packages/feeds/src/parse-rss.test.ts` | Parsing edge cases with small inline XML. |
| `packages/feeds/src/fetch-feed.test.ts` | Timeout, retry and failure classification, with a stub `fetch` and fake timers. |
| `apps/ingestion/package.json` | New workspace `ingestion`: `start: tsx src/main.ts`, `typecheck`. Dependencies: `@cto-signal/domain`, `@cto-signal/feeds` (`"*"`). |
| `apps/ingestion/tsconfig.json` | Same shape as `packages/feeds`. |
| `apps/ingestion/src/feeds.ts` | `IngestionFeed`, `DEFAULT_MAX_ITEMS`, `FEEDS`. |
| `apps/ingestion/src/run-ingestion.ts` | `runIngestion`, `formatReport`, `FeedReport`, `RunReport`. |
| `apps/ingestion/src/main.ts` | CLI entry. Output folder is `apps/ingestion/output/`, resolved from `import.meta.url`. Prints the report and sets the exit code. |
| `apps/ingestion/src/run-ingestion.test.ts` | End-to-end run tests with fixtures, a stub `fetch` and a temp output folder. |
| `apps/ingestion/src/fixtures/hn-rss.xml` | Today's HN capture, trimmed to 3 items (first item has `&#x27;` in its title). |
| `apps/ingestion/src/fixtures/aws-whats-new-rss.xml` | Today's AWS capture, trimmed to 3 items. |
| `package.json` (root) | Add `"ingest": "npm run start --workspace=apps/ingestion"`. |
| `package-lock.json` | Updated by `npm install`. |
| `.gitignore` | Add `apps/ingestion/output/`. |
| `.claude/rules/architecture.md` | Add `packages/feeds` to the shared-library list as the home of feed adapters, and `apps/ingestion` as the first app that consumes workspace packages. |

Root `vitest.config.ts`, `eslint.config.js` and the `typecheck` script already cover the new workspaces.

## Acceptance criteria → tests

Scenario tests are named with the scenario name verbatim; outlines use `it.each` with the row value appended.

| Scenario / NFR | Test file › test name |
|---|---|
| A run fetches both configured feeds | `apps/ingestion/src/run-ingestion.test.ts` › "A run fetches both configured feeds" (default `FEEDS`; asserts both URLs requested and each article's `sourceId` matches its feed) |
| Feed items become normalized articles | `run-ingestion.test.ts` › "Feed items become normalized articles" (HN fixture: title `We don't need more apps…`, canonical URL, id, date text; AWS fixture: HTML-free summary; output objects have only `Article` fields) |
| Hacker News articles have no summary | `run-ingestion.test.ts` › "Hacker News articles have no summary" |
| Each feed is capped at its item limit | `run-ingestion.test.ts` › "Each feed is capped at its item limit" (generated 100-item feed with `maxItems: 50`; the first 50 links are written, the last 50 aren't; report has `itemsRead: 100`, `itemsDropped: 50`) |
| A fetch attempt times out after 10 seconds | `packages/feeds/src/fetch-feed.test.ts` › "A fetch attempt times out after 10 seconds" (stub never resolves; signal not aborted at 9,999 ms, aborted at 10,000 ms) |
| Transient failures are retried at most twice | `fetch-feed.test.ts` › `it.each` "Transient failures are retried at most twice (network error / timeout / HTTP 429 / HTTP 503)" (3 calls, delays of 1 s then 2 s, `ok: false` with the matching `kind`) |
| Non-transient failures are not retried | `fetch-feed.test.ts` › `it.each` "Non-transient failures are not retried (HTTP 404 / a body that is not XML / XML that is not RSS)" (1 call, `ok: false`) |
| One failing feed does not stop the others | `run-ingestion.test.ts` › "One failing feed does not stop the others" (HN stub always 503; AWS articles in the file; HN reported failed) |
| Accepted articles are written to a new JSON file per run | `run-ingestion.test.ts` › "Accepted articles are written to a new JSON file per run" (two runs with different `now`; two files, the first unchanged; cross-feed duplicate written once; `git check-ignore` confirms `apps/ingestion/output/` is ignored) |
| A run reports each feed's outcome | `run-ingestion.test.ts` › "A run reports each feed's outcome" (fixture with one link-less item → `itemsRead`, `itemsDropped`, `accepted`, `rejected` with `invalid-url`; failed feed carries its `failure`) |
| NFR: tests make no real network calls | Enforced by design: `fetch` is a required parameter of `fetchFeed` and `runIngestion`, and every test passes a stub. No separate test. |
| NFR: a run is bounded in time | `run-ingestion.test.ts` › "a run where every feed always times out finishes within 3 × 10 s plus backoff" (fake timers; resolves after 33 s of fake time, both feeds failed) |
| NFR: same ids on re-run | `run-ingestion.test.ts` › "re-running against unchanged feeds produces the same article ids" |
| Edge: recovery after a transient failure | `fetch-feed.test.ts` › "a feed that fails with HTTP 503 once and then succeeds returns its items after 2 attempts" |
| Edge: one-item feed | `parse-rss.test.ts` › "parses a feed with a single item into a one-element array" |
| Edge: CDATA and entities | `parse-rss.test.ts` › "decodes CDATA, named and numeric entities in item fields" |
| Edge: missing fields | `parse-rss.test.ts` › "maps missing item elements to undefined" |
| Edge: HTML page | `parse-rss.test.ts` › "rejects an HTML page as invalid-xml" |
| Edge: large real feed | `parse-rss.test.ts` › "parses a feed with more than 1,000 entities" (guards the raised limit; generated XML) |
| Edge: default limit | `run-ingestion.test.ts` › "every configured feed uses the default item limit of 50" |
| Edge: report formatting | `run-ingestion.test.ts` › "formatReport lists each feed with counts or its failure reason" |

## Dependencies

- `fast-xml-parser@^4.5.7` (MIT, one transitive dependency, `strnum`; 4.5.7 published 2026-07-02). Node has no XML parser, and regex-parsing RSS would mishandle CDATA and entities. I picked v4 over v5.12 because v5 pulls in six dependencies for no gain here.

## Risks / open questions

- **Entity expansion limit.** fast-xml-parser 4.5.7 caps entity expansions at 1,000 per document by default, and the real AWS feed has ~2,800, so the default throws "Entity expansion limit exceeded" (reproduced 2026-11-17). Plan: `processEntities: { maxTotalExpansions: 50_000 }`. That's ~17× today's AWS feed and still a bound against entity-bomb input. If AWS's feed grows past it, the feed fails as `invalid-xml` and the report says so.
- **Fake timers and async retries.** Tests must use `vi.advanceTimersByTimeAsync` so promise callbacks run between timer steps. This is a known Vitest pattern, and the plan doesn't depend on real time anywhere.
- **Running TS sources across workspaces.** `tsx` must resolve `@cto-signal/domain` and `@cto-signal/feeds` through their `exports: ./src/index.ts`. This is the first time a workspace consumes another; verify `npm run ingest` once during implementation. If it fails, fix it in config, not by adding a build step.
- **Gitignore check in a test.** The file-per-run scenario shells out to `git check-ignore`, which needs a git checkout. CI has one. If that proves brittle, fall back to a manual check and record it as a deviation.
- **Feed etiquette.** No `User-Agent` override and no conditional GET. A local manual run every so often is well within normal use.

## Post-implementation notes

Implemented 2026-11-17 on `feature/002-rss-ingestion`. `npm run check` passes (108 tests). A real `npm run ingest` run: HN 30 read and 30 accepted; AWS 100 read, 50 dropped by the limit, 50 accepted; 80 articles written.

**Deviations from the plan**
- The output file is written with `flag: "wx"`, so an existing file is never overwritten. This enforces "the previous run's file is unchanged" even if two runs share a millisecond start time. In that case the second run rejects with `EEXIST` instead of overwriting. That is acceptable for a local, manual run.
- `fetchFeed` cancels the body of a non-2xx response to release the connection, and reports a network error as `message: cause` (Node's fetch puts the real reason, such as DNS or TLS, in `error.cause`). Both came from the review.
- `parseRssItems` treats an empty `<channel/>` (which parses to `""`) as an empty feed rather than `not-rss`. This also came from the review.
- `.claude/rules/architecture.md` also records that apps run TS sources with `tsx`, and that tsconfigs of workspaces that import another workspace omit `rootDir`.
- Risks that didn't happen: `tsx` resolved the cross-workspace `exports: ./src/index.ts` with no config, and `git check-ignore` in a test works locally. The parser's default `maxExpandedLength` (100k characters) is enough for the live AWS feed, so only `maxTotalExpansions` is raised, as planned.

**Test-author output.** 47 tests. SPEC GAPS were all already resolved by the plan (concurrent fetch, 1 s / 2 s backoff, file-name format, first-feed-wins dedupe), so none changed behavior. After the test commit, one assertion was *strengthened*: `formatReport` checked `toContain("50")`, which "503" also satisfied, so it now checks `"50 dropped by limit"` plus the failure message. Three helper tests were added for the review fixes. No assertion was weakened.

**Review (1 round, verdict: approve, no blocker/major)**
| Finding | Resolution |
|---|---|
| Post-implementation notes empty; `wx` undocumented | These notes; comment in code |
| `(error as Error).message` throws on a `null` rejection, breaking "never rejects" | Fixed (`describeError`), with a test |
| Network failure reason hides `error.cause` | Fixed, with a test |
| Error-response body left unread (socket leak) | Fixed (`response.body?.cancel()`) |
| In-feed duplicate ids are silently uncounted in the report | Documented on `FeedReport.accepted` (duplicates = read − dropped − rejected − accepted). I didn't add a field, so the plan's public interface stays as it is. |
| `formatReport` test's `"50"` assertion is too weak | Strengthened |
| Empty `<channel/>` misclassified as `not-rss` | Fixed, with a test |

**For the harness**
- *Test-author worked:* it ran in parallel with the implementation draft (kept in a scratchpad until the test commit, so it couldn't see it). All 47 tests but one passed on the first implementation run, and that one was the expected `.gitignore` check.
- *Candidate rule (testing.md):* in a `toContain` assertion on formatted output, use a whole phrase, not a bare number. Bare numbers collide (`50` in `503`).
- *Candidate adapter convention:* adapters that "never reject" should turn unknown errors into messages with an `instanceof Error` guard, never `(e as Error)`.

