/** An item as a source adapter hands it over, before normalization. */
export type RawArticle = {
  sourceId: string;
  title?: string;
  link?: string;
  /** The date text the source provides. */
  publishedAt?: string;
  /** May contain HTML. */
  summary?: string;
};

/** The canonical article shape used across CTO Signal. */
export type Article = {
  /** SHA-256 hex of `url`. Stable across tracking parameters and fragments. */
  id: string;
  sourceId: string;
  title: string;
  /** Canonical URL. */
  url: string;
  /** The source's date text, unparsed. Absent when the source has none. */
  publishedAt?: string;
  /** Plain text, at most 2000 words. Absent when the source has none. */
  summary?: string;
};
