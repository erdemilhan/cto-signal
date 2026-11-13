import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RawArticle } from "../article.js";
import { normalizeArticle, normalizeArticles } from "./normalize-article.js";
import {
  awsKiroGrok,
  hnCoway,
  hnCowayTracked,
  hnJepa,
  htmlHeavySummary,
  javascriptLink,
  missingTitle,
  missingDate,
} from "./fixtures/raw-articles.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function accept(raw: RawArticle) {
  const result = normalizeArticle(raw);
  if (!result.ok) throw new Error(`expected accept, got ${result.reason}`);
  return result.article;
}

describe("normalizeArticle", () => {
  it("normalizes the HN RSS and AWS sample items into the full article shape", () => {
    const cowayUrl =
      "https://scottjg.com/posts/2026-11-11-reverse-engineering-my-coway-air-purifier-to-ditch-the-cloud";
    expect(accept(hnCoway)).toStrictEqual({
      id: sha256(cowayUrl),
      sourceId: "hacker-news",
      title: "Reverse engineering my Coway air purifier to ditch the cloud",
      url: cowayUrl,
      publishedAt: "Thu, 12 Nov 2026 22:03:09 +0000",
    });

    const awsUrl = "https://aws.amazon.com/about-aws/whats-new/2026/11/kiro-grok-4-7-aws-govcloud-us";
    expect(accept(awsKiroGrok)).toStrictEqual({
      id: sha256(awsUrl),
      sourceId: "aws-whats-new",
      title: "Grok 4.7 now available on Kiro in AWS GovCloud (US)",
      url: awsUrl,
      publishedAt: "Fri, 13 Nov 2026 13:13:00 GMT",
      summary:
        "A new model is now available in the Kiro IDE and CLI for the AWS GovCloud (US) Regions. " +
        "Grok 4.7 is SpaceXSI's most capable model for coding and knowledge work.",
    });
  });

  it("normalizes a messy title", () => {
    expect(accept({ ...hnJepa, title: "  After 600\texperiments,\n here's   what " }).title).toBe(
      "After 600 experiments, here's what",
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", missingTitle.title],
  ])("rejects a %s title as missing-title", (_label, title) => {
    expect(normalizeArticle({ ...hnCoway, title })).toStrictEqual({
      ok: false,
      reason: "missing-title",
    });
  });

  it("rejects the javascript: link fixture as invalid-url", () => {
    expect(normalizeArticle(javascriptLink)).toStrictEqual({
      ok: false,
      reason: "invalid-url",
    });
  });

  it("rejects a missing link as invalid-url", () => {
    expect(normalizeArticle({ ...hnCoway, link: undefined })).toStrictEqual({
      ok: false,
      reason: "invalid-url",
    });
  });

  it("same story with different tracking parameters and fragment gets the same id", () => {
    const a = accept(hnCoway);
    const b = accept(hnCowayTracked);
    expect(b.url).toBe(a.url);
    expect(b.id).toBe(a.id);
  });

  it("id is unaffected by title, summary, source, and date", () => {
    const variant = accept({
      sourceId: "other",
      title: "Different title",
      link: hnCoway.link,
      publishedAt: "2020-01-01T00:00:00Z",
      summary: "<p>different</p>",
    });
    expect(variant.id).toBe(accept(hnCoway).id);
  });

  it("id is the sha256 hex of the canonical URL", () => {
    const article = accept(hnJepa);
    expect(article.id).toMatch(/^[0-9a-f]{64}$/);
    expect(article.id).toBe(sha256("https://haddyalchaer.com/jepa"));
  });

  it("keeps the publication date as the feed's text, trimmed", () => {
    expect(accept({ ...hnCoway, publishedAt: "  Thu, 12 Nov 2026 22:03:09 +0000\n" }).publishedAt).toBe(
      "Thu, 12 Nov 2026 22:03:09 +0000",
    );
    expect(accept({ ...hnCoway, publishedAt: "sometime last week" }).publishedAt).toBe(
      "sometime last week",
    );
  });

  it.each([
    ["missing", undefined],
    ["blank", "  "],
  ])("omits a %s publication date", (_label, publishedAt) => {
    expect(accept({ ...hnCoway, publishedAt })).not.toHaveProperty("publishedAt");
  });

  it("missing-date fixture is accepted without a publication date", () => {
    expect(accept(missingDate)).not.toHaveProperty("publishedAt");
  });

  it("HTML-heavy summary fixture becomes plain text", () => {
    expect(accept(htmlHeavySummary).summary).toBe(
      "Amazon S3 now supports conditional writes & reads. Faster Cheaper – 20%",
    );
  });

  it.each([
    ["only tags and whitespace", "<p> </p>\n<br/><div></div>"],
    ["empty", ""],
    ["missing", undefined],
  ])("summary that is %s is omitted", (_label, summary) => {
    expect(accept({ ...hnCoway, summary })).not.toHaveProperty("summary");
  });

  it("truncates a long summary to 2000 words", () => {
    const longSummary = `<p>${Array.from({ length: 2500 }, (_, i) => `w${i}`).join(" ")}</p>`;
    const summary = accept({ ...hnCoway, summary: longSummary }).summary ?? "";
    expect(summary.split(" ")).toHaveLength(2000);
    expect(summary.endsWith("w1999")).toBe(true);
  });
});

describe("normalizeArticles", () => {
  it("batch keeps the first of two items with the same canonical URL", () => {
    const { accepted } = normalizeArticles([hnCoway, hnCowayTracked]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.title).toBe(hnCoway.title);
    expect(accepted[0]?.sourceId).toBe("hacker-news");
  });

  it("batch of mixed fixtures returns all valid articles and each rejected item with its reason", () => {
    const batch = [
      missingTitle,
      hnCoway,
      javascriptLink,
      hnJepa,
      hnCowayTracked,
      awsKiroGrok,
      missingDate,
      htmlHeavySummary,
    ];
    const { accepted, rejected } = normalizeArticles(batch);

    expect(accepted.map((a) => a.title)).toEqual([
      hnCoway.title,
      hnJepa.title,
      awsKiroGrok.title,
      missingDate.title,
      htmlHeavySummary.title,
    ]);
    expect(rejected).toStrictEqual([
      { item: missingTitle, reason: "missing-title" },
      { item: javascriptLink, reason: "invalid-url" },
    ]);
  });

  it("normalizing the same batch twice yields deep-equal output", () => {
    const batch = [hnCoway, hnJepa, awsKiroGrok, missingDate, htmlHeavySummary, javascriptLink];
    expect(normalizeArticles(batch)).toStrictEqual(normalizeArticles(batch));
  });
});
