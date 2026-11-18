import type { RawArticle } from "@tech-news-signal/domain";
import { parseRssItems, RssParseError } from "./parse-rss.js";

export type FeedSource = {
  /** Becomes RawArticle.sourceId. */
  id: string;
  url: string;
  /** True → items get no summary. */
  ignoreDescription?: boolean;
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

export const FETCH_TIMEOUT_MS = 10_000;
export const RETRY_DELAYS_MS = [1_000, 2_000] as const;
export const MAX_ATTEMPTS = 3;

type Attempt = { ok: true; body: string } | { ok: false; failure: FeedFailure };

/**
 * Fetches and parses one feed. Never rejects. Transient failures (network,
 * timeout, 429, 5xx) are retried after RETRY_DELAYS_MS; others return at once.
 */
export async function fetchFeed(
  source: FeedSource,
  deps: { fetch: typeof globalThis.fetch },
): Promise<FetchFeedResult> {
  let attempt = await fetchOnce(source.url, deps.fetch);
  for (const delay of RETRY_DELAYS_MS) {
    if (attempt.ok || !isTransient(attempt.failure)) break;
    await sleep(delay);
    attempt = await fetchOnce(source.url, deps.fetch);
  }
  if (!attempt.ok) return attempt;

  try {
    return { ok: true, items: parseRssItems(attempt.body, source) };
  } catch (error) {
    if (error instanceof RssParseError) {
      return { ok: false, failure: { kind: error.kind, message: error.message } };
    }
    return { ok: false, failure: { kind: "invalid-xml", message: String(error) } };
  }
}

async function fetchOnce(url: string, fetchFn: typeof globalThis.fetch): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) {
      // Release the connection; the body of an error response is not needed.
      await response.body?.cancel().catch(() => {});
      return {
        ok: false,
        failure: { kind: "http", status: response.status, message: `HTTP ${response.status}` },
      };
    }
    return { ok: true, body: await response.text() };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        failure: { kind: "timeout", message: `No response within ${FETCH_TIMEOUT_MS} ms` },
      };
    }
    return { ok: false, failure: { kind: "network", message: describeError(error) } };
  } finally {
    clearTimeout(timer);
  }
}

/** Node's fetch rejects with "fetch failed" and keeps the real reason (DNS, TLS, refused) in `cause`. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

function isTransient(failure: FeedFailure): boolean {
  if (failure.kind === "network" || failure.kind === "timeout") return true;
  if (failure.kind === "http") return failure.status === 429 || failure.status >= 500;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
