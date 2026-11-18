import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeArticles } from "@tech-news-signal/domain";
import type { Article, RejectionReason } from "@tech-news-signal/domain";
import { fetchFeed } from "@tech-news-signal/feeds";
import type { FeedFailure } from "@tech-news-signal/feeds";
import { FEEDS } from "./feeds.js";
import type { IngestionFeed } from "./feeds.js";

export type FeedReport =
  | {
      sourceId: string;
      status: "ok";
      /** Items in the feed. */
      itemsRead: number;
      /** Items beyond maxItems, not normalized. */
      itemsDropped: number;
      /**
       * After normalization, before cross-feed dedupe. Repeated ids within the feed
       * count once, so itemsRead - itemsDropped - rejected.length - accepted is the
       * number of in-feed duplicates.
       */
      accepted: number;
      rejected: { title?: string; link?: string; reason: RejectionReason }[];
    }
  | { sourceId: string; status: "failed"; failure: FeedFailure };

export type RunReport = {
  /** ISO 8601. */
  startedAt: string;
  /** Absolute path of the JSON file written. */
  outputFile: string;
  articlesWritten: number;
  /** In feed-list order. */
  feeds: FeedReport[];
};

/** Fetches every feed, normalizes their items and writes one JSON file for the run. */
export async function runIngestion(deps: {
  fetch: typeof globalThis.fetch;
  outputDir: string;
  now?: () => Date;
  feeds?: readonly IngestionFeed[];
}): Promise<RunReport> {
  const startedAt = (deps.now ?? (() => new Date()))().toISOString();
  const feeds = deps.feeds ?? FEEDS;

  const results = await Promise.all(feeds.map((feed) => fetchFeed(feed, { fetch: deps.fetch })));

  const reports: FeedReport[] = [];
  const articles: Article[] = [];
  const seen = new Set<string>();

  feeds.forEach((feed, i) => {
    const result = results[i];
    if (!result.ok) {
      reports.push({ sourceId: feed.id, status: "failed", failure: result.failure });
      return;
    }
    const kept = result.items.slice(0, feed.maxItems);
    const { accepted, rejected } = normalizeArticles(kept);
    reports.push({
      sourceId: feed.id,
      status: "ok",
      itemsRead: result.items.length,
      itemsDropped: result.items.length - kept.length,
      accepted: accepted.length,
      rejected: rejected.map(({ item, reason }) => ({ title: item.title, link: item.link, reason })),
    });
    for (const article of accepted) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      articles.push(article);
    }
  });

  const outputDir = path.resolve(deps.outputDir);
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `${startedAt.replace(/[:.]/g, "-")}.json`);
  // "wx": never overwrite an existing run's file, even if two runs share a start time.
  await writeFile(outputFile, `${JSON.stringify(articles, null, 2)}\n`, { flag: "wx" });

  return { startedAt, outputFile, articlesWritten: articles.length, feeds: reports };
}

/** Renders a run report as plain text for the console. */
export function formatReport(report: RunReport): string {
  const lines = [`Run ${report.startedAt}: ${report.articlesWritten} articles written to ${report.outputFile}`];
  for (const feed of report.feeds) {
    if (feed.status === "failed") {
      lines.push(`  ${feed.sourceId}: FAILED (${feed.failure.kind}) ${feed.failure.message}`);
      continue;
    }
    lines.push(
      `  ${feed.sourceId}: ${feed.itemsRead} read, ${feed.itemsDropped} dropped by limit, ` +
        `${feed.accepted} accepted, ${feed.rejected.length} rejected`,
    );
    for (const r of feed.rejected) {
      lines.push(`    rejected (${r.reason}): ${r.title ?? "(no title)"} ${r.link ?? "(no link)"}`);
    }
  }
  return lines.join("\n");
}
