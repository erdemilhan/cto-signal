import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeUrl, normalizeArticle, type Article, type RawArticle } from "@tech-news-signal/domain";
import { DEFAULT_MAX_ITEMS, FEEDS, type IngestionFeed } from "./feeds.js";
import { formatReport, runIngestion, type RunReport } from "./run-ingestion.js";

const HN_URL = "https://news.ycombinator.com/rss";
const AWS_URL = "https://aws.amazon.com/about-aws/whats-new/recent/feed/";
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ARTICLE_KEYS = ["id", "sourceId", "title", "url", "publishedAt", "summary"];

// Raw values as they appear in the fixtures (captured 2026-11-17), entities decoded.
const HN_ITEMS = [
  {
    title: "We don't need more apps. We need better open source",
    link: "https://jordankrueger.com/blog/better-open-source-not-more-apps/",
    publishedAt: "Tue, 17 Nov 2026 14:45:36 +0000",
  },
  {
    title: `Comcast's "fiber-powered Wi-Fi" is cable, AT&T says in false advertising case`,
    link: "https://arstechnica.com/tech-policy/2026/11/comcast-falsely-advertises-cable-internet-as-fiber-powered-att-lawsuit-says/",
    publishedAt: "Mon, 16 Nov 2026 20:48:08 +0000",
  },
  {
    title: "What is the best harness for each model?",
    link: "https://runta.com/blog/introducing-frontierharness-eval-v1-1/",
    publishedAt: "Tue, 17 Nov 2026 14:53:43 +0000",
  },
];
const AWS_LINKS = [
  "https://aws.amazon.com/about-aws/whats-new/2026/11/security-hub-gcp/",
  "https://aws.amazon.com/about-aws/whats-new/2026/11/replication-deletes-amazon-ecr",
  "https://aws.amazon.com/about-aws/whats-new/2026/11/ebs-snapshots-associate-kms-keys/",
];

let hnXml: string;
let awsXml: string;
let outputDir: string;

beforeAll(async () => {
  hnXml = await readFile(new URL("./fixtures/hn-rss.xml", import.meta.url), "utf8");
  awsXml = await readFile(new URL("./fixtures/aws-whats-new-rss.xml", import.meta.url), "utf8");
});

beforeEach(async () => {
  outputDir = await mkdtemp(path.join(tmpdir(), "tech-news-signal-ingestion-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(outputDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers

type Responder = (init: RequestInit | undefined) => Promise<Response>;

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** A stub `fetch` that routes by URL. Unknown URLs fail, so no test can reach the network. */
function routes(table: Record<string, Responder>) {
  const requested: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = urlOf(input);
    requested.push(url);
    const respond = table[url];
    if (!respond) return Promise.reject(new TypeError(`unexpected request to ${url}`));
    return respond(init);
  });
  return { fetch, requested };
}

const ok =
  (body: string): Responder =>
  () =>
    Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } }));

const status =
  (code: number): Responder =>
  () =>
    Promise.resolve(new Response(`HTTP ${code}`, { status: code }));

const neverResponds: Responder = (init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    const abort = () => reject(new DOMException("This operation was aborted", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
  });

function rss(items: { title?: string; link?: string; pubDate?: string; description?: string }[]): string {
  const el = (name: string, value?: string) => (value === undefined ? "" : `<${name}>${value}</${name}>`);
  return (
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
    `<title>Generated</title><link>https://example.com/</link><description>Generated</description>` +
    items
      .map((i) => `<item>${el("title", i.title)}${el("link", i.link)}${el("pubDate", i.pubDate)}${el("description", i.description)}</item>`)
      .join("") +
    `</channel></rss>`
  );
}

const fixedNow = (iso: string) => () => new Date(iso);

async function readArticles(report: RunReport): Promise<Article[]> {
  return JSON.parse(await readFile(report.outputFile, "utf8")) as Article[];
}

function accept(raw: RawArticle): Article {
  const result = normalizeArticle(raw);
  if (!result.ok) throw new Error(`fixture item unexpectedly rejected: ${result.reason}`);
  return result.article;
}

function useFakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-11-17T16:00:00.000Z"));
}

/**
 * Advances fake time in small steps, yielding to real I/O between steps, until `promise` settles.
 * While no fake timers are pending (e.g. the run is waiting on real file I/O), it only yields and
 * leaves the fake clock alone, so slow disks (CI) don't inflate measured fake time.
 */
async function settle<T>(promise: Promise<T>, maxMs = 120_000, stepMs = 50): Promise<T> {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  const maxIdleYields = 100_000;
  let elapsed = 0;
  let idleYields = 0;
  while (!done && elapsed <= maxMs && idleYields <= maxIdleYields) {
    if (vi.getTimerCount() > 0) {
      await vi.advanceTimersByTimeAsync(stepMs);
      elapsed += stepMs;
    } else {
      idleYields++;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!done) throw new Error(`promise did not settle within ${maxMs} ms of fake time`);
  return promise;
}

// ---------------------------------------------------------------------------

describe("runIngestion", () => {
  it("A run fetches both configured feeds", async () => {
    expect(FEEDS.map((f) => [f.id, f.url])).toStrictEqual([
      ["hacker-news", HN_URL],
      ["aws-whats-new", AWS_URL],
    ]);
    const { fetch, requested } = routes({ [HN_URL]: ok(hnXml), [AWS_URL]: ok(awsXml) });

    const report = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") });

    expect(new Set(requested)).toStrictEqual(new Set([HN_URL, AWS_URL]));

    const articles = await readArticles(report);
    expect(articles).toHaveLength(6);
    expect(report.articlesWritten).toBe(6);
    const hnUrls = new Set(HN_ITEMS.map((i) => canonicalizeUrl(i.link)));
    const awsUrls = new Set(AWS_LINKS.map((l) => canonicalizeUrl(l)));
    for (const article of articles) {
      if (hnUrls.has(article.url)) expect(article.sourceId).toBe("hacker-news");
      else if (awsUrls.has(article.url)) expect(article.sourceId).toBe("aws-whats-new");
      else throw new Error(`article from an unknown feed: ${article.url}`);
    }
    expect(articles.filter((a) => a.sourceId === "hacker-news")).toHaveLength(3);
    expect(articles.filter((a) => a.sourceId === "aws-whats-new")).toHaveLength(3);
  });

  it("Feed items become normalized articles", async () => {
    const { fetch } = routes({ [HN_URL]: ok(hnXml), [AWS_URL]: ok(awsXml) });

    const report = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") });
    const articles = await readArticles(report);

    // The fixture's first HN title is "We don&#x27;t need more apps. ..." and is decoded.
    const [first] = HN_ITEMS;
    const expected = accept({ sourceId: "hacker-news", ...first! });
    expect(expected.title).toBe("We don't need more apps. We need better open source");
    expect(articles).toContainEqual(expected);
    expect(articles.find((a) => a.title.startsWith("We don't need more apps"))).toStrictEqual(expected);

    // Every HN item is normalized by the spec 001 rules from title, link and date (no description).
    for (const item of HN_ITEMS) {
      expect(articles).toContainEqual(accept({ sourceId: "hacker-news", ...item }));
    }

    // AWS: title, link and date carried through spec 001; the entity-escaped HTML description becomes plain text.
    const security = articles.find((a) => a.url === canonicalizeUrl(AWS_LINKS[0]));
    expect(security).toMatchObject({
      sourceId: "aws-whats-new",
      title: "AWS Security Hub extends unified security management to Google Cloud Platform",
      publishedAt: "Tue, 17 Nov 2026 08:00:00 GMT",
    });
    expect(security?.id).toBe(accept({ sourceId: "aws-whats-new", title: "x", link: AWS_LINKS[0] }).id);
    expect(security?.summary).toMatch(
      /^Today, AWS announces that AWS Security Hub now monitors Google Cloud Platform \(GCP\) resources/,
    );
    for (const article of articles.filter((a) => a.sourceId === "aws-whats-new")) {
      expect(article.summary).toBeDefined();
      expect(article.summary).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(article.summary).not.toMatch(/&(lt|gt|amp|quot|#x?[0-9a-f]+);/i);
    }

    // No other item fields (guid, category, author, comments) are kept.
    for (const article of articles) {
      for (const key of Object.keys(article)) expect(ARTICLE_KEYS).toContain(key);
    }
    expect(JSON.stringify(articles)).not.toContain("8bc36fad49393a8146e3a7910694db10c12619ba");
    expect(JSON.stringify(articles)).not.toContain("news.ycombinator.com/item?id=");
  });

  it("Hacker News articles have no summary", async () => {
    const { fetch } = routes({ [HN_URL]: ok(hnXml), [AWS_URL]: ok(awsXml) });

    const report = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") });
    const hnArticles = (await readArticles(report)).filter((a) => a.sourceId === "hacker-news");

    expect(hnArticles).toHaveLength(3);
    for (const article of hnArticles) {
      expect(article).not.toHaveProperty("summary");
    }
  });

  it("Each feed is capped at its item limit", async () => {
    const links = Array.from({ length: 100 }, (_, n) => `https://example.com/items/${n + 1}`);
    const feed: IngestionFeed = { id: "big-feed", url: "https://example.com/big.xml", maxItems: 50 };
    const { fetch } = routes({
      [feed.url]: ok(rss(links.map((link, n) => ({ title: `Item ${n + 1}`, link })))),
    });

    const report = await runIngestion({ fetch, outputDir, feeds: [feed], now: fixedNow("2026-11-17T16:03:01.123Z") });
    const articles = await readArticles(report);

    expect(articles.map((a) => a.url)).toStrictEqual(links.slice(0, 50).map((l) => canonicalizeUrl(l)));
    const written = new Set(articles.map((a) => a.url));
    for (const link of links.slice(50)) expect(written.has(canonicalizeUrl(link)!)).toBe(false);

    expect(report.feeds).toStrictEqual([
      { sourceId: "big-feed", status: "ok", itemsRead: 100, itemsDropped: 50, accepted: 50, rejected: [] },
    ]);
  });

  it("every configured feed uses the default item limit of 50", () => {
    expect(DEFAULT_MAX_ITEMS).toBe(50);
    expect(FEEDS).toHaveLength(2);
    for (const feed of FEEDS) expect(feed.maxItems).toBe(DEFAULT_MAX_ITEMS);
    expect(FEEDS.find((f) => f.id === "hacker-news")?.ignoreDescription).toBe(true);
    expect(FEEDS.find((f) => f.id === "aws-whats-new")?.ignoreDescription).toBeFalsy();
  });

  it("One failing feed does not stop the others", async () => {
    useFakeClock();
    const { fetch, requested } = routes({ [HN_URL]: status(503), [AWS_URL]: ok(awsXml) });

    const report = await settle(runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") }));

    expect(requested.filter((u) => u === HN_URL)).toHaveLength(3);
    const articles = await readArticles(report);
    expect(articles.map((a) => a.url).sort()).toStrictEqual(AWS_LINKS.map((l) => canonicalizeUrl(l)).sort());
    for (const article of articles) expect(article.sourceId).toBe("aws-whats-new");

    expect(report.feeds[0]).toMatchObject({ sourceId: "hacker-news", status: "failed", failure: { kind: "http", status: 503 } });
    expect(report.feeds[1]).toMatchObject({ sourceId: "aws-whats-new", status: "ok", accepted: 3 });
  });

  it("Accepted articles are written to a new JSON file per run", async () => {
    const feeds: IngestionFeed[] = [
      { id: "feed-a", url: "https://a.example.com/rss", maxItems: 50 },
      { id: "feed-b", url: "https://b.example.com/rss", maxItems: 50 },
    ];
    const x = "https://example.com/x";
    const y = "https://example.com/y";
    const z = "https://example.com/z";
    const { fetch } = routes({
      [feeds[0]!.url]: ok(rss([{ title: "X", link: x }, { title: "Y from A", link: y }])),
      // Y appears in both feeds (with a tracking parameter here), so it shares an id and is written once.
      [feeds[1]!.url]: ok(rss([{ title: "Y from B", link: `${y}?utm_source=rss` }, { title: "Z", link: z }])),
    });

    // A previous run's output file exists.
    const first = await runIngestion({ fetch, outputDir, feeds, now: fixedNow("2026-11-17T16:03:01.123Z") });
    expect(path.basename(first.outputFile)).toBe("2026-11-17T16-03-01-123Z.json");
    const firstContent = await readFile(first.outputFile, "utf8");

    // When a run completes.
    const second = await runIngestion({ fetch, outputDir, feeds, now: fixedNow("2026-11-17T17:04:05.678Z") });

    // A new JSON file named by the run's start time.
    expect(second.startedAt).toBe("2026-11-17T17:04:05.678Z");
    expect(path.isAbsolute(second.outputFile)).toBe(true);
    expect(path.dirname(second.outputFile)).toBe(path.resolve(outputDir));
    expect(path.basename(second.outputFile)).toBe("2026-11-17T17-04-05-678Z.json");
    expect((await readdir(outputDir)).sort()).toStrictEqual([
      "2026-11-17T16-03-01-123Z.json",
      "2026-11-17T17-04-05-678Z.json",
    ]);

    // Accepted articles from all successful feeds, deduplicated by id.
    const articles = await readArticles(second);
    expect(articles.map((a) => a.url).sort()).toStrictEqual([x, y, z].map((l) => canonicalizeUrl(l)).sort());
    expect(new Set(articles.map((a) => a.id)).size).toBe(articles.length);
    expect(second.articlesWritten).toBe(3);

    // The previous run's file is unchanged.
    expect(await readFile(first.outputFile, "utf8")).toBe(firstContent);

    // The output folder is ignored by git.
    expect(() =>
      execFileSync("git", ["check-ignore", "-q", "apps/ingestion/output/2026-11-17T16-03-01-123Z.json"], {
        cwd: REPO_ROOT,
        stdio: "ignore",
      }),
    ).not.toThrow();
  });

  it("A run reports each feed's outcome", async () => {
    const feeds: IngestionFeed[] = [
      { id: "mixed", url: "https://mixed.example.com/rss", maxItems: 4 },
      { id: "gone", url: "https://gone.example.com/rss", maxItems: 50 },
    ];
    const { fetch } = routes({
      [feeds[0]!.url]: ok(
        rss([
          { title: "Fine one", link: "https://example.com/fine-1" },
          { title: "No link here" },
          { link: "https://example.com/untitled" },
          { title: "Fine two", link: "https://example.com/fine-2" },
          { title: "Beyond the limit", link: "https://example.com/beyond" },
        ]),
      ),
      [feeds[1]!.url]: status(404),
    });

    const report = await runIngestion({ fetch, outputDir, feeds, now: fixedNow("2026-11-17T16:03:01.123Z") });

    expect(report.startedAt).toBe("2026-11-17T16:03:01.123Z");
    expect(report.articlesWritten).toBe(2);
    expect(report.feeds).toEqual([
      {
        sourceId: "mixed",
        status: "ok",
        itemsRead: 5,
        itemsDropped: 1,
        accepted: 2,
        rejected: [
          { title: "No link here", reason: "invalid-url" },
          { link: "https://example.com/untitled", reason: "missing-title" },
        ],
      },
      {
        sourceId: "gone",
        status: "failed",
        failure: { kind: "http", status: 404, message: expect.any(String) },
      },
    ]);
  });

  it("a run where every feed always times out finishes within 3 × 10 s plus backoff", async () => {
    useFakeClock();
    const { fetch } = routes({ [HN_URL]: neverResponds, [AWS_URL]: neverResponds });
    const startedAt = Date.now();

    const report = await settle(
      runIngestion({ fetch, outputDir, now: () => new Date() }),
      120_000,
      10,
    );
    const elapsed = Date.now() - startedAt;

    // 3 attempts × 10 s + 1 s + 2 s backoff = 33 s; small slack for step granularity and file I/O.
    expect(elapsed).toBeLessThanOrEqual(3 * 10_000 + 1_000 + 2_000 + 1_000);
    expect(report.feeds).toHaveLength(2);
    for (const feed of report.feeds) {
      expect(feed).toMatchObject({ status: "failed", failure: { kind: "timeout" } });
    }
  });

  it("re-running against unchanged feeds produces the same article ids", async () => {
    const { fetch } = routes({ [HN_URL]: ok(hnXml), [AWS_URL]: ok(awsXml) });

    const first = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") });
    const second = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T18:00:00.000Z") });

    const ids = async (r: RunReport) => (await readArticles(r)).map((a) => a.id).sort();
    const firstIds = await ids(first);
    expect(firstIds).toHaveLength(6);
    expect(await ids(second)).toStrictEqual(firstIds);
  });

  it("a run where every feed fails still writes an empty JSON file", async () => {
    const { fetch } = routes({ [HN_URL]: status(404), [AWS_URL]: status(404) });

    const report = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") });

    expect(report.articlesWritten).toBe(0);
    expect(await readArticles(report)).toStrictEqual([]);
    expect(report.feeds.map((f) => f.status)).toStrictEqual(["failed", "failed"]);
  });

  it("creates the output folder when it does not exist", async () => {
    const nested = path.join(outputDir, "nested", "output");
    const { fetch } = routes({ [HN_URL]: ok(hnXml), [AWS_URL]: ok(awsXml) });

    const report = await runIngestion({ fetch, outputDir: nested, now: fixedNow("2026-11-17T16:03:01.123Z") });

    expect(path.dirname(report.outputFile)).toBe(path.resolve(nested));
    expect(await readArticles(report)).toHaveLength(6);
  });

  it("reports feeds in feed-list order with counts for the real fixtures", async () => {
    const { fetch } = routes({ [HN_URL]: ok(hnXml), [AWS_URL]: ok(awsXml) });

    const report = await runIngestion({ fetch, outputDir, now: fixedNow("2026-11-17T16:03:01.123Z") });

    expect(report.feeds).toStrictEqual([
      { sourceId: "hacker-news", status: "ok", itemsRead: 3, itemsDropped: 0, accepted: 3, rejected: [] },
      { sourceId: "aws-whats-new", status: "ok", itemsRead: 3, itemsDropped: 0, accepted: 3, rejected: [] },
    ]);
  });
});

describe("formatReport", () => {
  it("formatReport lists each feed with counts or its failure reason", () => {
    const report: RunReport = {
      startedAt: "2026-11-17T16:03:01.123Z",
      outputFile: "/tmp/output/2026-11-17T16-03-01-123Z.json",
      articlesWritten: 49,
      feeds: [
        {
          sourceId: "aws-whats-new",
          status: "ok",
          itemsRead: 100,
          itemsDropped: 50,
          accepted: 49,
          rejected: [{ title: "No link here", reason: "invalid-url" }],
        },
        {
          sourceId: "hacker-news",
          status: "failed",
          failure: { kind: "http", status: 503, message: "HTTP 503 Service Unavailable" },
        },
      ],
    };

    const text = formatReport(report);

    expect(text).toContain("aws-whats-new");
    expect(text).toContain("100");
    expect(text).toContain("50 dropped by limit");
    expect(text).toContain("49");
    expect(text).toContain("invalid-url");
    expect(text).toContain("hacker-news");
    expect(text).toContain("503");
    expect(text).toContain("HTTP 503 Service Unavailable");
    expect(text).toContain("/tmp/output/2026-11-17T16-03-01-123Z.json");
  });
});
