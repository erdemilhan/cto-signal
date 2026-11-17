import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchFeed,
  FETCH_TIMEOUT_MS,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  type FeedFailure,
  type FeedSource,
  type FetchFeedResult,
} from "./index.js";

const source: FeedSource = { id: "test-feed", url: "https://example.com/rss" };

const VALID_RSS =
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
  `<title>Test</title><link>https://example.com/</link><description>Test</description>` +
  `<item><title>First</title><link>https://example.com/1</link>` +
  `<pubDate>Tue, 17 Nov 2026 14:45:36 +0000</pubDate><description>One</description></item>` +
  `<item><title>Second</title><link>https://example.com/2</link>` +
  `<pubDate>Tue, 17 Nov 2026 14:53:43 +0000</pubDate><description>Two</description></item>` +
  `</channel></rss>`;

const ATOM =
  `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
  `<title>Atom</title><entry><title>Entry</title><link href="https://example.com/e"/></entry></feed>`;

type Attempt = { url: string; startedAt: number; abortedAt?: number; signal?: AbortSignal };
type Responder = (init: RequestInit | undefined, attempt: Attempt, index: number) => Promise<Response>;

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** A stub `fetch` that records every attempt (with fake-clock timestamps) and delegates to `respond`. */
function stubFetch(respond: Responder) {
  const attempts: Attempt[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const signal = init?.signal ?? undefined;
    const attempt: Attempt = { url: urlOf(input), startedAt: Date.now(), signal };
    signal?.addEventListener("abort", () => (attempt.abortedAt = Date.now()), { once: true });
    attempts.push(attempt);
    return respond(init, attempt, attempts.length - 1);
  });
  return { fetch, attempts };
}

function abortError() {
  return new DOMException("This operation was aborted", "AbortError");
}

/** A request that never responds; it rejects with an AbortError only when its signal is aborted. */
const neverResponds: Responder = (init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) return reject(abortError());
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });

const respondWith =
  (body: string, status = 200): Responder =>
  () =>
    Promise.resolve(new Response(body, { status, headers: { "content-type": "application/rss+xml" } }));

/**
 * Advances the fake clock in small steps, yielding to real I/O between steps, until `promise` settles.
 * Fails instead of hanging when the promise does not settle within `maxMs` of fake time.
 */
async function settle<T>(promise: Promise<T>, maxMs = 120_000, stepMs = 50): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let elapsed = 0; !done && elapsed <= maxMs; elapsed += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!done) throw new Error(`promise did not settle within ${maxMs} ms of fake time`);
  return promise;
}

function expectFailure(result: FetchFeedResult, expected: Partial<FeedFailure>) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure).toMatchObject(expected);
  expect(typeof result.failure.message).toBe("string");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-11-17T16:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchFeed", () => {
  it("uses a 10 s timeout and up to 3 attempts with a short backoff", () => {
    expect(FETCH_TIMEOUT_MS).toBe(10_000);
    expect(MAX_ATTEMPTS).toBe(3);
    expect([...RETRY_DELAYS_MS]).toStrictEqual([1_000, 2_000]);
  });

  it("A fetch attempt times out after 10 seconds", async () => {
    const { fetch, attempts } = stubFetch(neverResponds);

    const pending = fetchFeed(source, { fetch });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.signal).toBeDefined();
    expect(attempts[0]?.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempts[0]?.signal?.aborted).toBe(true);

    const result = await settle(pending);
    expectFailure(result, { kind: "timeout" });
    expect(attempts).toHaveLength(3);
    for (const attempt of attempts) {
      expect(attempt.abortedAt).toBeDefined();
      expect((attempt.abortedAt ?? 0) - attempt.startedAt).toBe(10_000);
    }
  });

  it("a response whose body never finishes is abandoned after 10 seconds", async () => {
    const { fetch, attempts } = stubFetch((init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(abortError()), { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const pending = fetchFeed(source, { fetch });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(attempts[0]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts[0]?.signal?.aborted).toBe(true);

    const result = await settle(pending);
    expectFailure(result, { kind: "timeout" });
  });

  it.each<[string, Responder, Partial<FeedFailure>, number]>([
    ["network error", () => Promise.reject(new TypeError("fetch failed")), { kind: "network" }, 0],
    ["timeout", neverResponds, { kind: "timeout" }, FETCH_TIMEOUT_MS],
    ["HTTP 429", respondWith("Too Many Requests", 429), { kind: "http", status: 429 }, 0],
    ["HTTP 503", respondWith("Service Unavailable", 503), { kind: "http", status: 503 }, 0],
  ])("Transient failures are retried at most twice (%s)", async (_failure, respond, expected, attemptMs) => {
    const { fetch, attempts } = stubFetch(respond);

    const result = await settle(fetchFeed(source, { fetch }));

    // The feed is attempted 3 times ...
    expect(attempts).toHaveLength(3);
    // ... with a short backoff between attempts (1 s, then 2 s, after each attempt ends).
    const [first, second, third] = attempts.map((a) => a.startedAt) as [number, number, number];
    expect(second - first).toBeGreaterThanOrEqual(attemptMs + RETRY_DELAYS_MS[0]);
    expect(second - first).toBeLessThan(attemptMs + RETRY_DELAYS_MS[0] + 200);
    expect(third - second).toBeGreaterThanOrEqual(attemptMs + RETRY_DELAYS_MS[1]);
    expect(third - second).toBeLessThan(attemptMs + RETRY_DELAYS_MS[1] + 200);

    // ... and the feed is reported as failed.
    expectFailure(result, expected);

    // No further attempts happen later.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toHaveLength(3);
  });

  it.each<[string, Responder, Partial<FeedFailure>]>([
    ["HTTP 404", respondWith("Not Found", 404), { kind: "http", status: 404 }],
    ["a body that is not XML", respondWith(`{"error":"not xml"}`), { kind: "invalid-xml" }],
    ["XML that is not RSS", respondWith(ATOM), { kind: "not-rss" }],
  ])("Non-transient failures are not retried (%s)", async (_response, respond, expected) => {
    const { fetch, attempts } = stubFetch(respond);

    const result = await settle(fetchFeed(source, { fetch }));

    expect(attempts).toHaveLength(1);
    expectFailure(result, expected);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toHaveLength(1);
  });

  it("a feed that fails with HTTP 503 once and then succeeds returns its items after 2 attempts", async () => {
    const { fetch, attempts } = stubFetch((init, attempt, index) =>
      index === 0 ? respondWith("Service Unavailable", 503)(init, attempt, index) : respondWith(VALID_RSS)(init, attempt, index),
    );

    const result = await settle(fetchFeed(source, { fetch }));

    expect(attempts).toHaveLength(2);
    expect(result).toEqual({
      ok: true,
      items: [
        {
          sourceId: "test-feed",
          title: "First",
          link: "https://example.com/1",
          publishedAt: "Tue, 17 Nov 2026 14:45:36 +0000",
          summary: "One",
        },
        {
          sourceId: "test-feed",
          title: "Second",
          link: "https://example.com/2",
          publishedAt: "Tue, 17 Nov 2026 14:53:43 +0000",
          summary: "Two",
        },
      ],
    });
  });

  it("an HTTP 500 is treated as transient and retried", async () => {
    const { fetch, attempts } = stubFetch(respondWith("Internal Server Error", 500));
    const result = await settle(fetchFeed(source, { fetch }));
    expect(attempts).toHaveLength(3);
    expectFailure(result, { kind: "http", status: 500 });
  });

  it("an HTTP 403 is treated as permanent and not retried", async () => {
    const { fetch, attempts } = stubFetch(respondWith("Forbidden", 403));
    const result = await settle(fetchFeed(source, { fetch }));
    expect(attempts).toHaveLength(1);
    expectFailure(result, { kind: "http", status: 403 });
  });

  it("requests the source URL with an abort signal", async () => {
    const { fetch, attempts } = stubFetch(respondWith(VALID_RSS));
    const result = await settle(fetchFeed(source, { fetch }));
    expect(result.ok).toBe(true);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.url).toBe("https://example.com/rss");
    expect(attempts[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("applies the source id and ignoreDescription to the parsed items", async () => {
    const hn: FeedSource = { id: "hacker-news", url: "https://news.ycombinator.com/rss", ignoreDescription: true };
    const { fetch } = stubFetch(respondWith(VALID_RSS));
    const result = await settle(fetchFeed(hn, { fetch }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.sourceId).toBe("hacker-news");
      expect(item.summary).toBeUndefined();
    }
  });

  it("never rejects, even when fetch throws synchronously", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      throw new TypeError("boom");
    });
    const result = await settle(fetchFeed(source, { fetch }));
    expect(result.ok).toBe(false);
  });
});
