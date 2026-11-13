import type { RawArticle } from "../../article.js";

// Modelled on real items captured 2026-11-13 from news.ycombinator.com/rss and
// aws.amazon.com/about-aws/whats-new/recent/feed/, as the RSS adapter (spec 002)
// would hand them over: XML entities decoded, HN's "Comments" description dropped.

export const hnCoway: RawArticle = {
  sourceId: "hacker-news",
  title: "Reverse engineering my Coway air purifier to ditch the cloud",
  link: "https://scottjg.com/posts/2026-11-11-reverse-engineering-my-coway-air-purifier-to-ditch-the-cloud/",
  publishedAt: "Thu, 12 Nov 2026 22:03:09 +0000",
};

export const hnJepa: RawArticle = {
  sourceId: "hacker-news",
  title: "After 600 experiments, here's what I discovered about JEPA world models",
  link: "https://haddyalchaer.com/jepa",
  publishedAt: "Fri, 13 Nov 2026 17:55:28 +0000",
};

export const awsKiroGrok: RawArticle = {
  sourceId: "aws-whats-new",
  title: "Grok 4.7 now available on Kiro in AWS GovCloud (US)",
  link: "https://aws.amazon.com/about-aws/whats-new/2026/11/kiro-grok-4-7-aws-govcloud-us/",
  publishedAt: "Fri, 13 Nov 2026 13:13:00 GMT",
  summary:
    "<p>A new model is now available in the Kiro IDE and CLI for the AWS GovCloud (US) Regions.</p> \n" +
    "<p>Grok 4.7 is SpaceXSI's most capable model for coding and knowledge work.</p>",
};

/** Same story as `hnCoway`, shared with tracking parameters and a fragment. */
export const hnCowayTracked: RawArticle = {
  ...hnCoway,
  sourceId: "aws-whats-new",
  title: "Coway purifier, shared again",
  link: "HTTPS://ScottJG.com/posts/2026-11-11-reverse-engineering-my-coway-air-purifier-to-ditch-the-cloud/?utm_source=hn&utm_medium=rss&fbclid=abc123#comments",
};

export const missingTitle: RawArticle = {
  sourceId: "hacker-news",
  title: "  \n\t ",
  link: "https://example.com/untitled",
  publishedAt: "Fri, 13 Nov 2026 10:00:00 +0000",
};

export const javascriptLink: RawArticle = {
  sourceId: "hacker-news",
  title: "Totally safe link",
  link: "javascript:alert(1)",
  publishedAt: "Fri, 13 Nov 2026 10:00:00 +0000",
};

export const missingDate: RawArticle = {
  sourceId: "aws-whats-new",
  title: "Item without a date",
  link: "https://aws.amazon.com/about-aws/whats-new/2026/11/no-date/",
};

export const htmlHeavySummary: RawArticle = {
  sourceId: "aws-whats-new",
  title: "Item with an HTML-heavy summary",
  link: "https://aws.amazon.com/about-aws/whats-new/2026/11/html-heavy/",
  publishedAt: "Fri, 13 Nov 2026 13:13:00 GMT",
  summary:
    '<style>p { color: red }</style><div class="intro"><p>Amazon&nbsp;S3 now supports <b>conditional</b>\n' +
    '<a href="https://example.com">writes</a> &amp; reads.</p><script>track("x")</script>' +
    "<ul><li>Faster</li><li>Cheaper &#x2013; 20%</li></ul></div>",
};
