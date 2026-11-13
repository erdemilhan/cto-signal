import { describe, expect, it } from "vitest";
import { collapseWhitespace, htmlToText, truncateWords } from "./text-normalize.js";

describe("collapseWhitespace", () => {
  it("trims and collapses tabs/newlines/multiple spaces", () => {
    expect(collapseWhitespace("  Hello \t\n  world  \r\n ")).toBe("Hello world");
  });
});

describe("htmlToText", () => {
  it("strips tags, script/style contents, decodes entities", () => {
    expect(
      htmlToText(
        "<style>.x{}</style><p>Fish &amp; chips &lt;b&gt; &quot;q&quot; &#39;a&apos; a&nbsp;b &#8212; &#x2013;</p><script>alert(1)</script>",
      ),
    ).toBe(`Fish & chips <b> "q" 'a' a b — –`);
  });

  it("drops an unclosed script/style block to the end of the input", () => {
    expect(htmlToText('<p>Kept text</p><script>track("x"); var a = 1')).toBe("Kept text");
  });

  it("does not glue words together across block tags", () => {
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one two");
  });

  it("leaves unknown or invalid entities as they are", () => {
    expect(htmlToText("&bogus; &#0; &#x110000;")).toBe("&bogus; &#0; &#x110000;");
  });
});

describe("truncateWords", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(" ");

  it("truncateWords keeps exactly 2000 words of a 2500-word text", () => {
    const result = truncateWords(words(2500), 2000);
    expect(result.split(" ")).toHaveLength(2000);
    expect(result).toBe(words(2000));
  });

  it("leaves a 2000-word text unchanged", () => {
    expect(truncateWords(words(2000), 2000)).toBe(words(2000));
  });

  it("never cuts a word in half", () => {
    const result = truncateWords("alpha beta gamma delta", 2);
    expect(result).toBe("alpha beta");
  });
});
