import { describe, expect, it } from "vitest";
import { parseRssItems, RssParseError, type FeedSource } from "./index.js";

const source: FeedSource = { id: "test-feed", url: "https://example.com/rss" };
const RAW_ARTICLE_KEYS = ["sourceId", "title", "link", "publishedAt", "summary"];

function rss(itemsXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
    `<title>Test feed</title><link>https://example.com/</link><description>Test</description>` +
    itemsXml +
    `</channel></rss>`
  );
}

function expectParseError(xml: string, kind: "invalid-xml" | "not-rss") {
  let caught: unknown;
  try {
    parseRssItems(xml, source);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RssParseError);
  expect((caught as RssParseError).kind).toBe(kind);
}

describe("parseRssItems", () => {
  it("maps title, link, pubDate and description to a RawArticle with the source id", () => {
    const xml = rss(
      `<item><title>Hello</title><link>https://example.com/a</link>` +
        `<pubDate>Tue, 17 Nov 2026 14:45:36 +0000</pubDate><description>Body</description></item>`,
    );
    expect(parseRssItems(xml, source)).toStrictEqual([
      {
        sourceId: "test-feed",
        title: "Hello",
        link: "https://example.com/a",
        publishedAt: "Tue, 17 Nov 2026 14:45:36 +0000",
        summary: "Body",
      },
    ]);
  });

  it("parses a feed with a single item into a one-element array", () => {
    const items = parseRssItems(rss(`<item><title>Only</title><link>https://example.com/only</link></item>`), source);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Only");
  });

  it("returns an empty array for an RSS channel with no items", () => {
    expect(parseRssItems(rss(""), source)).toStrictEqual([]);
  });

  it("keeps items in feed order", () => {
    const xml = rss(
      [1, 2, 3, 4, 5].map((n) => `<item><title>Item ${n}</title><link>https://example.com/${n}</link></item>`).join(""),
    );
    expect(parseRssItems(xml, source).map((i) => i.title)).toStrictEqual([
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
      "Item 5",
    ]);
  });

  it("decodes CDATA, named and numeric entities in item fields", () => {
    const xml = rss(
      `<item>` +
        `<title>Comcast&#x27;s &quot;fiber-powered Wi-Fi&quot; is cable, AT&#x26;T says &amp; more</title>` +
        `<link>https://example.com/a?x=1&amp;y=2</link>` +
        `<description><![CDATA[<a href="https://news.ycombinator.com/item?id=50532086">Comments</a>]]></description>` +
        `</item>` +
        `<item>` +
        `<title>We don&#x27;t need more apps</title>` +
        `<link>https://example.com/b</link>` +
        `<description>&lt;p&gt;Hello &amp; welcome&lt;/p&gt;</description>` +
        `</item>`,
    );
    const [first, second] = parseRssItems(xml, source);
    expect(first?.title).toBe(`Comcast's "fiber-powered Wi-Fi" is cable, AT&T says & more`);
    expect(first?.link).toBe("https://example.com/a?x=1&y=2");
    expect(first?.summary).toBe(`<a href="https://news.ycombinator.com/item?id=50532086">Comments</a>`);
    expect(second?.title).toBe("We don't need more apps");
    expect(second?.summary).toBe("<p>Hello & welcome</p>");
  });

  it("keeps a numeric-looking title as a string", () => {
    const [item] = parseRssItems(rss(`<item><title>2048</title><link>https://example.com/2048</link></item>`), source);
    expect(item?.title).toBe("2048");
  });

  it("maps missing item elements to undefined", () => {
    const [item] = parseRssItems(rss(`<item><title>Title only</title></item>`), source);
    expect(item).toEqual({ sourceId: "test-feed", title: "Title only" });
    expect(item?.link).toBeUndefined();
    expect(item?.publishedAt).toBeUndefined();
    expect(item?.summary).toBeUndefined();
  });

  it("drops item fields other than title, link, pubDate and description", () => {
    const xml = rss(
      `<item><guid isPermaLink="false">8bc36fad49393a8146e3a7910694db10c12619ba</guid>` +
        `<title>AWS thing</title><description>&lt;p&gt;Text&lt;/p&gt;</description>` +
        `<pubDate>Tue, 17 Nov 2026 08:00:00 GMT</pubDate>` +
        `<category>general:products/aws-security-hub</category><author>aws@amazon.com</author>` +
        `<comments>https://news.ycombinator.com/item?id=1</comments>` +
        `<link>https://aws.amazon.com/about-aws/whats-new/2026/11/security-hub-gcp/</link></item>`,
    );
    const [item] = parseRssItems(xml, source);
    for (const key of Object.keys(item ?? {})) {
      expect(RAW_ARTICLE_KEYS).toContain(key);
    }
    expect(item).toEqual({
      sourceId: "test-feed",
      title: "AWS thing",
      link: "https://aws.amazon.com/about-aws/whats-new/2026/11/security-hub-gcp/",
      publishedAt: "Tue, 17 Nov 2026 08:00:00 GMT",
      summary: "<p>Text</p>",
    });
  });

  it("leaves summary out when the source ignores descriptions", () => {
    const hn: FeedSource = { id: "hacker-news", url: "https://news.ycombinator.com/rss", ignoreDescription: true };
    const xml = rss(
      `<item><title>Story</title><link>https://example.com/story</link>` +
        `<pubDate>Tue, 17 Nov 2026 14:45:36 +0000</pubDate>` +
        `<description><![CDATA[<a href="https://news.ycombinator.com/item?id=1">Comments</a>]]></description></item>`,
    );
    const [item] = parseRssItems(xml, hn);
    expect(item?.summary).toBeUndefined();
    expect(item).toEqual({
      sourceId: "hacker-news",
      title: "Story",
      link: "https://example.com/story",
      publishedAt: "Tue, 17 Nov 2026 14:45:36 +0000",
    });
  });

  it("parses a feed with more than 1,000 entities", () => {
    // The real AWS What's New feed carries ~2,800 entities (entity-escaped HTML descriptions).
    const paragraph = "&lt;p&gt;Amazon &amp; AWS&lt;/p&gt;".repeat(100); // 300 entities
    const xml = rss(
      Array.from(
        { length: 10 },
        (_, n) => `<item><title>Item ${n}</title><link>https://example.com/${n}</link><description>${paragraph}</description></item>`,
      ).join(""),
    );
    const items = parseRssItems(xml, source);
    expect(items).toHaveLength(10);
    expect(items[9]?.summary).toBe("<p>Amazon & AWS</p>".repeat(100));
  });

  it("rejects an HTML page as invalid-xml", () => {
    const html =
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Oops</title></head>` +
      `<body><p>Service unavailable<br></body></html>`;
    expectParseError(html, "invalid-xml");
  });

  it("rejects a body that is not XML as invalid-xml", () => {
    expectParseError(`{"error":"not xml"}`, "invalid-xml");
    expectParseError("Service temporarily unavailable", "invalid-xml");
  });

  it("rejects an empty body as invalid-xml", () => {
    expectParseError("", "invalid-xml");
  });

  it("rejects truncated XML as invalid-xml", () => {
    const whole = rss(`<item><title>Cut</title><link>https://example.com/cut</link></item>`);
    expectParseError(whole.slice(0, whole.length - 20), "invalid-xml");
  });

  it("rejects well-formed XML that is not RSS as not-rss", () => {
    const atom =
      `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
      `<title>Atom</title><entry><title>Entry</title><link href="https://example.com/e"/></entry></feed>`;
    expectParseError(atom, "not-rss");
  });

  it("rejects an rss element without a channel as not-rss", () => {
    expectParseError(`<?xml version="1.0"?><rss version="2.0"><item><title>x</title></item></rss>`, "not-rss");
  });

  it("RssParseError is an Error", () => {
    let caught: unknown;
    try {
      parseRssItems("not xml at all <", source);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
  });
});

describe("parseRssItems (empty channel)", () => {
  it("treats an empty channel element as a feed with no items", () => {
    const source = { id: "s", url: "https://example.com/rss" };
    expect(parseRssItems("<rss version=\"2.0\"><channel></channel></rss>", source)).toEqual([]);
    expect(parseRssItems("<rss version=\"2.0\"><channel/></rss>", source)).toEqual([]);
  });
});
