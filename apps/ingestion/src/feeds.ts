import type { FeedSource } from "@tech-news-signal/feeds";

/** Per-feed item cap. Bounds downstream work (storage, later LLM calls), not the download. */
export const DEFAULT_MAX_ITEMS = 50;

export type IngestionFeed = FeedSource & {
  /** Keep at most this many items, in feed order. */
  maxItems: number;
};

/** The feeds a run ingests. Edit here to change sources or their item limits. */
export const FEEDS: readonly IngestionFeed[] = [
  {
    id: "hacker-news",
    url: "https://news.ycombinator.com/rss",
    ignoreDescription: true,
    maxItems: DEFAULT_MAX_ITEMS,
  },
  {
    id: "aws-whats-new",
    url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/",
    maxItems: DEFAULT_MAX_ITEMS,
  },
];
