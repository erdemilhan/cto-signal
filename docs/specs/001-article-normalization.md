# 001 — Article normalization and identity

Status: Implemented

## Problem

The initial sources are RSS 2.0 feeds: Hacker News (`news.ycombinator.com/rss`) and AWS What's New. Their items differ in shape, often with tracking parameters and inconsistent whitespace. Before we fetch or store anything, CTO Signal needs one canonical article shape and a stable identity, so the same story is recognized as the same story. That identity is the basis for idempotent ingestion in later specs.

## Acceptance criteria

- A raw item with a source id, title, link, and publication date normalizes to an article with: id, source id, title, canonical URL, and optional publication date and summary.
- Titles are trimmed and internal whitespace is collapsed to single spaces. An item whose title is empty after this is rejected with a reason.
- URLs are canonicalized: scheme and host lowercased, fragment removed, tracking query parameters removed, and a trailing slash removed from non-root paths. Tracking parameters are a maintained list: any `utm_*` parameter plus known click/referral trackers (at minimum `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, `ref`, `ref_src`, `igshid`, `_hsenc`, `_hsmi`). Other query parameters are kept, because some sources identify the story by them (e.g. `news.ycombinator.com/item?id=123`). An item whose link is missing, unparseable, or not `http`/`https` is rejected with a reason.
- The article id is derived only from the canonical URL, so the same story with different tracking parameters or fragments gets the same id.
- The publication date is kept as the text the feed provides, with surrounding whitespace trimmed; it is not parsed or converted. A missing or blank date means the article has no publication date.
- Summaries have HTML tags removed and whitespace collapsed; an empty result means no summary.
- Summaries longer than 2000 words are truncated to the first 2000 words, at a word boundary.
- Normalizing a batch returns the accepted articles (duplicates by id removed, first occurrence kept) and the rejected items, each with its reason. One bad item never prevents the others from being accepted.

## Non-functional requirements

- Deterministic: the same input always produces the same output, including the id.
- No I/O and no clock access.

## Constraints

- Domain logic only, in `packages/domain`. No AWS SDK, provider SDK, network, or file-system access. Node built-ins are allowed.
- No new runtime dependencies unless the plan justifies one.

## Test data

- Tests use a small set of sample raw items modelled on real items from the Hacker News RSS feed and the AWS What's New RSS feed (as captured on 2026-11-13), plus malformed ones: missing title, `javascript:` link, missing date, HTML-heavy summary, and the same story with different tracking parameters.

## Out of scope

- Fetching feeds and parsing RSS XML (spec 002: RSS ingestion).
- The Hacker News JSON API. HN is ingested through its RSS feed only.
- Persistence and deduplication across runs (spec 003: storage and idempotency).
- Relevance scoring, categorization, summarization by LLM.

## Open questions

None. Resolved 2026-11-13:
- Summaries are capped at 2000 words.
- All known tracking parameters are stripped, not only `utm_*`. Non-tracking query parameters are kept.
- Publication dates are stored and displayed as the feed's text, not parsed (decided during implementation, 2026-11-13).
