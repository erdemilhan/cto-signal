import { createHash } from "node:crypto";
import type { Article, RawArticle } from "../article.js";
import { canonicalizeUrl } from "./canonical-url.js";
import { collapseWhitespace, htmlToText, truncateWords } from "./text-normalize.js";

export type RejectionReason = "missing-title" | "invalid-url";

export type NormalizeResult =
  | { ok: true; article: Article }
  | { ok: false; reason: RejectionReason };

export type BatchResult = {
  accepted: Article[];
  rejected: { item: RawArticle; reason: RejectionReason }[];
};

const MAX_SUMMARY_WORDS = 2000;

/** Normalizes one raw item. */
export function normalizeArticle(raw: RawArticle): NormalizeResult {
  const title = collapseWhitespace(raw.title ?? "");
  if (title === "") return { ok: false, reason: "missing-title" };

  const url = canonicalizeUrl(raw.link);
  if (url === undefined) return { ok: false, reason: "invalid-url" };

  const publishedAt = collapseWhitespace(raw.publishedAt ?? "");
  const summary = truncateWords(htmlToText(raw.summary ?? ""), MAX_SUMMARY_WORDS);

  return {
    ok: true,
    article: {
      id: createHash("sha256").update(url).digest("hex"),
      sourceId: raw.sourceId,
      title,
      url,
      ...(publishedAt === "" ? {} : { publishedAt }),
      ...(summary === "" ? {} : { summary }),
    },
  };
}

/**
 * Normalizes a batch. Each item is handled independently; duplicates by id are
 * dropped, keeping the first occurrence.
 */
export function normalizeArticles(raws: readonly RawArticle[]): BatchResult {
  const accepted: Article[] = [];
  const rejected: BatchResult["rejected"] = [];
  const seen = new Set<string>();

  for (const item of raws) {
    const result = normalizeArticle(item);
    if (!result.ok) {
      rejected.push({ item, reason: result.reason });
    } else if (!seen.has(result.article.id)) {
      seen.add(result.article.id);
      accepted.push(result.article);
    }
  }

  return { accepted, rejected };
}
