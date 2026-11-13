/** Trims and collapses every run of whitespace to a single space. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Converts an HTML fragment to plain display text. Not a sanitizer: callers
 * that render the result as HTML must still escape it.
 */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    // A truncated feed can cut a block before its closing tag: drop the rest.
    .replace(/<(script|style)\b[^>]*>[\s\S]*$/i, " ");
  const withoutTags = withoutBlocks.replace(/<[^>]*>/g, " ");
  return collapseWhitespace(decodeEntities(withoutTags));
}

/** Keeps the first `maxWords` whitespace-separated words. */
export function truncateWords(text: string, maxWords: number): string {
  const collapsed = collapseWhitespace(text);
  const words = collapsed.split(" ");
  return words.length <= maxWords ? collapsed : words.slice(0, maxWords).join(" ");
}
