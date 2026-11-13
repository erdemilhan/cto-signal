/**
 * Query parameters that only track clicks or referrals. Any `utm_*` parameter
 * is also removed. Matching is case-insensitive.
 */
export const TRACKING_PARAMS: readonly string[] = [
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "igshid",
  "_hsenc",
  "_hsmi",
];

const trackingSet = new Set(TRACKING_PARAMS);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || trackingSet.has(lower);
}

/**
 * Returns the canonical form of an http(s) link, or `undefined` when the link
 * is missing, unparseable, or uses another scheme.
 */
export function canonicalizeUrl(link: string | undefined): string | undefined {
  if (link === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  url.hash = "";

  // Always re-serialize the query, so URLs that differ only in tracking
  // parameters also end up with identical encoding of the remaining ones.
  const kept = [...url.searchParams].filter(([name]) => !isTrackingParam(name));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
