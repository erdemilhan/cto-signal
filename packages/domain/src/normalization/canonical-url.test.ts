import { describe, expect, it } from "vitest";
import { canonicalizeUrl, TRACKING_PARAMS } from "./canonical-url.js";

describe("canonicalizeUrl", () => {
  it("lowercases scheme and host but not path", () => {
    expect(canonicalizeUrl("HTTPS://News.Example.COM/Posts/My-Story")).toBe(
      "https://news.example.com/Posts/My-Story",
    );
  });

  it("removes the fragment", () => {
    expect(canonicalizeUrl("https://example.com/a#section-2")).toBe("https://example.com/a");
  });

  it("removes every utm_* parameter", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/a?utm_source=hn&utm_medium=rss&utm_campaign=x&utm_term=y&utm_content=z&utm_custom=1",
      ),
    ).toBe("https://example.com/a");
  });

  it.each(TRACKING_PARAMS)("removes the listed tracker %s", (param) => {
    expect(canonicalizeUrl(`https://example.com/a?${param}=abc&keep=1`)).toBe(
      "https://example.com/a?keep=1",
    );
  });

  it("covers every tracker the spec lists at minimum", () => {
    expect(TRACKING_PARAMS).toEqual(
      expect.arrayContaining([
        "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid",
        "ref", "ref_src", "igshid", "_hsenc", "_hsmi",
      ]),
    );
  });

  it("matches tracker names case-insensitively", () => {
    expect(canonicalizeUrl("https://example.com/a?UTM_Source=hn&FBCLID=x&Gclid=y")).toBe(
      "https://example.com/a",
    );
  });

  it("keeps non-tracking parameters, e.g. HN item ids", () => {
    expect(canonicalizeUrl("https://news.ycombinator.com/item?id=50474959&utm_source=x")).toBe(
      "https://news.ycombinator.com/item?id=50474959",
    );
  });

  it("two HN items with different ids stay distinct", () => {
    expect(canonicalizeUrl("https://news.ycombinator.com/item?id=1")).not.toBe(
      canonicalizeUrl("https://news.ycombinator.com/item?id=2"),
    );
  });

  it("keeps remaining parameters in their original order", () => {
    expect(canonicalizeUrl("https://example.com/s?b=2&utm_source=x&a=1")).toBe(
      "https://example.com/s?b=2&a=1",
    );
  });

  it("encodes remaining parameters the same whether or not trackers were present", () => {
    expect(canonicalizeUrl("https://example.com/s?q=a%20b&utm_source=x")).toBe(
      canonicalizeUrl("https://example.com/s?q=a%20b"),
    );
  });

  it("strips the trailing slash from /a/b/ but keeps the root /", () => {
    expect(canonicalizeUrl("https://example.com/a/b/")).toBe("https://example.com/a/b");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
    expect(canonicalizeUrl("https://example.com")).toBe("https://example.com/");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["unparseable", "not a url"],
    ["relative", "/posts/1"],
    ["javascript:", "javascript:alert(1)"],
    ["ftp:", "ftp://example.com/file"],
    ["mailto:", "mailto:someone@example.com"],
  ])("returns undefined for a %s link", (_label, link) => {
    expect(canonicalizeUrl(link)).toBeUndefined();
  });
});
