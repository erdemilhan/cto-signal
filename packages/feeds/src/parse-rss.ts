import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { RawArticle } from "@tech-news-signal/domain";
import type { FeedSource } from "./fetch-feed.js";

/** Raised when a body is not XML, or is XML but not an RSS document. */
export class RssParseError extends Error {
  readonly kind: "invalid-xml" | "not-rss";

  constructor(kind: "invalid-xml" | "not-rss", message: string) {
    super(message);
    this.name = "RssParseError";
    this.kind = kind;
  }
}

// The real AWS feed has ~2,800 entities, well over the parser's default of
// 1,000. These limits still bound entity-bomb input.
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  htmlEntities: true,
  processEntities: { maxTotalExpansions: 50_000 },
  isArray: (_name, jpath) => jpath === "rss.channel.item",
});

type RssItem = Record<string, unknown>;

/** Turns an RSS 2.0 document into raw articles, keeping only the fields normalization uses. */
export function parseRssItems(xml: string, source: FeedSource): RawArticle[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new RssParseError("invalid-xml", `Body is not valid XML: ${valid.err.msg}`);
  }

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (error) {
    throw new RssParseError("invalid-xml", `Body could not be parsed: ${(error as Error).message}`);
  }

  const rss = (doc as { rss?: unknown } | undefined)?.rss;
  const channel = typeof rss === "object" && rss !== null ? (rss as { channel?: unknown }).channel : undefined;
  // An empty <channel/> parses to "": a valid, empty feed.
  if (channel === "") return [];
  if (typeof channel !== "object" || channel === null) {
    throw new RssParseError("not-rss", "Document has no rss > channel element");
  }

  const items = ((channel as { item?: RssItem[] }).item ?? []) as RssItem[];
  return items.map((item) => ({
    sourceId: source.id,
    title: text(item.title),
    link: text(item.link),
    publishedAt: text(item.pubDate),
    ...(source.ignoreDescription ? {} : { summary: text(item.description) }),
  }));
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
