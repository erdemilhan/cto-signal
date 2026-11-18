# 002 — RSS ingestion

Status: Implemented

## Problem

Spec 001 gave Tech News Signal a canonical article shape, but nothing yet fetches real feeds. This spec fetches the two initial RSS sources (Hacker News and AWS What's New), turns their items into normalized articles, and keeps going when one source misbehaves. It runs locally. Storage and scheduling come later, so for this iteration the result is written to a local JSON file.

## Acceptance criteria

```gherkin
Feature: RSS ingestion

  Scenario: A run fetches both configured feeds
    Given the Hacker News feed at https://news.ycombinator.com/rss
    And the AWS What's New feed at https://aws.amazon.com/about-aws/whats-new/recent/feed/
    When a run starts
    Then both feeds are fetched
    And every article carries the stable source id of the feed it came from

  Scenario: Feed items become normalized articles
    Given a feed item titled "We don&#x27;t need more apps" with a link, a publication date and a description
    When a run ingests the feed
    Then the output has an article titled "We don't need more apps"
    And the article was normalized by the spec 001 rules from the item's title, link, publication date and description
    And no other item fields are kept

  Scenario: Hacker News articles have no summary
    Given a Hacker News item whose description is only a "Comments" link
    When a run ingests the feed
    Then the article for that item has no summary

  Scenario: Each feed is capped at its item limit
    Given a feed whose item limit is 50
    And the feed contains 100 items
    When a run ingests the feed
    Then only the first 50 items, in feed order, are normalized
    And the remaining 50 items are reported as dropped by the limit

  Scenario: A fetch attempt times out after 10 seconds
    Given a feed that never responds
    When a run fetches it
    Then each attempt is abandoned after 10 seconds

  Scenario Outline: Transient failures are retried at most twice
    Given a feed whose every attempt fails with <failure>
    When a run fetches it
    Then the feed is attempted 3 times, with a short backoff between attempts
    And the feed is reported as failed

    Examples:
      | failure       |
      | network error |
      | timeout       |
      | HTTP 429      |
      | HTTP 503      |

  Scenario Outline: Non-transient failures are not retried
    Given a feed that responds with <response>
    When a run fetches it
    Then the feed is attempted once
    And the feed is reported as failed

    Examples:
      | response                |
      | HTTP 404                |
      | a body that is not XML  |
      | XML that is not RSS     |

  Scenario: One failing feed does not stop the others
    Given the Hacker News feed fails after all retries
    And the AWS What's New feed responds normally
    When a run completes
    Then the AWS What's New articles are written

  Scenario: Accepted articles are written to a new JSON file per run
    Given a previous run's output file exists
    When a run completes
    Then the accepted articles from all successful feeds, deduplicated by id, are written to a new JSON file named by the run's start time
    And the previous run's file is unchanged
    And the output folder is ignored by git

  Scenario: A run reports each feed's outcome
    When a run completes
    Then for each successful feed it reports items read, items dropped by the limit, articles accepted, and rejected items with their reasons
    And for each failed feed it reports the reason it failed
```

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
- Each feed has a configurable item limit, set alongside the feed list in code. It defaults to 50 for both feeds. Changing it means editing that setting, not the ingestion logic.

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
- Each feed is capped at a configurable item limit, 50 for now. The cap bounds downstream work (storage, later LLM calls), not the download: RSS always returns the whole document.
