# 002 — RSS ingestion

Status: Draft

## Problem

Spec 001 gave CTO Signal a canonical article shape, but nothing yet fetches real feeds. This spec fetches the two initial RSS sources (Hacker News and AWS What's New), turns their items into normalized articles, and keeps going when one source misbehaves. It runs locally. Storage and scheduling come later, so for this iteration the result is written to a local JSON file.

## Acceptance criteria

- A run fetches both configured feeds: Hacker News (`https://news.ycombinator.com/rss`) and AWS What's New (`https://aws.amazon.com/about-aws/whats-new/recent/feed/`). Each feed has a stable source id, and every article from that feed carries it.
- Each RSS item's title, link, publication date and description are handed to normalization (spec 001), with XML entities and CDATA already decoded (e.g. `We don&#x27;t` becomes `We don't`). No other item fields are kept.
- Hacker News item descriptions are ignored, so Hacker News articles have no summary. (Each HN description is only a "Comments" link.)
- Every fetch attempt times out after 10 seconds.
- A transient failure (network error, timeout, HTTP 429 or 5xx) is retried up to 2 times with a short backoff, so at most 3 attempts per feed. Other HTTP 4xx responses and responses that aren't parseable RSS fail the feed immediately, without retrying.
- A feed that fails, after any retries, doesn't stop the run: the other feeds are still fetched, normalized and written.
- A run writes the accepted articles from all successful feeds, deduplicated by id, to a new JSON file in a local output folder, named by the run's start time, so earlier runs' files are kept. The folder is not committed to git.
- A run reports each feed's outcome: items read, articles accepted, and rejected items with their reasons, or the reason the feed failed.

## Non-functional requirements

- Tests make no real network calls. Feed responses, failures and timeouts are simulated at the HTTP boundary.
- A run is bounded in time. Even when every feed exhausts its retries, it finishes in about 3 × 10 seconds plus backoff for each feed.
- Re-running against unchanged feed content produces the same article ids. Deduplication across runs is out of scope.

## Constraints

- Fetching and RSS parsing live in an adapter in a shared package under `packages/*`, not in domain code. `packages/domain` stays free of network and I/O.
- Normalization reuses spec 001 unchanged. Mapping feed items to raw items is the adapter's job.
- The runnable entry point is a new `apps/ingestion` workspace, started locally with an npm script. No AWS resources, Lambda handler or CloudFormation in this spec.
- An XML-parsing dependency is allowed if the plan justifies it. Fetching uses Node's built-in HTTP client.
- The feed list is fixed in code for this iteration. There is no config file or environment variable for it.

## Test data

- Tests use captures of the real Hacker News and AWS What's New RSS feeds (taken 2026-11-17), trimmed to a handful of items each. They also use malformed cases: non-XML body, XML that isn't RSS, an item with no link, HTTP 404, HTTP 503 followed by success, and a request that never responds.

## Out of scope

- Persisting articles, deduplication across runs, and `ingestedAt` (spec 003: article storage).
- Lambda, EventBridge scheduling, SQS and DLQ (spec 005: scheduled ingestion).
- Sources other than these two feeds, Atom feeds, and the Hacker News JSON API.
- Conditional requests (ETag / `If-Modified-Since`) and rate limiting beyond the retry policy.
- AWS `guid` and categories, and the HN comments URL. They aren't kept, because article identity comes from the canonical URL (spec 001) and nothing downstream uses them yet.

## Open questions

None. Resolved 2026-11-17:
- Hacker News descriptions are dropped; HN articles have no summary.
- Output is a local JSON file, one new file per run, named by run time.
- Retries: up to 2, on transient failures only.
