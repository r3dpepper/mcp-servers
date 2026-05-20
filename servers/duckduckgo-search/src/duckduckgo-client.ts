/**
 * DuckDuckGo search client — no API key required.
 *
 * Uses two complementary DuckDuckGo endpoints:
 *
 * 1. Instant Answer API (api.duckduckgo.com)
 *    - Official, free, no auth
 *    - Returns structured data: definitions, infoboxes, related topics
 *    - Does NOT return a classic list of web results
 *    - Best for: quick answers, definitions, topic summaries
 *
 * 2. HTML search scraper (html.duckduckgo.com)
 *    - Parses DuckDuckGo's lite HTML page for classic web results
 *    - Returns title + URL + snippet list like a normal SERP
 *    - Best for: open-ended web searches
 *
 * Both are combined in the exported search functions below.
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

// ── Shared types ─────────────────────────────────────────────────────────────

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface InstantAnswer {
  heading: string;
  abstract: string;
  abstractSource: string;
  abstractURL: string;
  answer: string;
  answerType: string;
  definition: string;
  definitionSource: string;
  /** Related topics / sub-topics */
  relatedTopics: Array<{ text: string; url: string }>;
  /** Direct infobox data (e.g. for famous people, places) */
  infobox: Array<{ label: string; value: string }>;
}

export interface DuckDuckGoSearchResponse {
  instantAnswer: InstantAnswer | null;
  webResults: WebResult[];
  query: string;
  source: "instant_answer" | "html_scrape" | "combined";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INSTANT_ANSWER_API = "https://api.duckduckgo.com/";
const HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; MCPHub/1.0; +https://github.com/your-org/mcp-hub)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// ── Instant Answer API ────────────────────────────────────────────────────────

export async function fetchInstantAnswer(
  query: string
): Promise<InstantAnswer | null> {
  const url = new URL(INSTANT_ANSWER_API);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  logger.debug("DDG Instant Answer API request", { query });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs
  );

  try {
    const res = await fetch(url.toString(), {
      headers: { ...HEADERS, Accept: "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn("DDG Instant Answer API non-OK response", {
        status: res.status,
      });
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    // No meaningful content
    if (
      !data.Abstract &&
      !data.Answer &&
      !data.Definition &&
      (!data.RelatedTopics || data.RelatedTopics.length === 0)
    ) {
      return null;
    }

    const relatedTopics: InstantAnswer["relatedTopics"] = (
      data.RelatedTopics ?? []
    )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((t: any) => t.FirstURL && t.Text)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => ({ text: t.Text, url: t.FirstURL }));

    const infobox: InstantAnswer["infobox"] = (
      data.Infobox?.content ?? []
    )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((item: any) => item.label && item.value)
      .slice(0, 8)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ({
        label: String(item.label),
        value: String(item.value),
      }));

    return {
      heading: data.Heading ?? "",
      abstract: data.Abstract ?? "",
      abstractSource: data.AbstractSource ?? "",
      abstractURL: data.AbstractURL ?? "",
      answer: data.Answer ?? "",
      answerType: data.AnswerType ?? "",
      definition: data.Definition ?? "",
      definitionSource: data.DefinitionSource ?? "",
      relatedTopics,
      infobox,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── HTML Scraper ──────────────────────────────────────────────────────────────

export async function scrapeWebResults(
  query: string,
  maxResults: number = config.maxResults
): Promise<WebResult[]> {
  logger.debug("DDG HTML scrape request", { query, maxResults });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.requestTimeoutMs
  );

  try {
    const res = await fetch(HTML_SEARCH_URL, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ q: query, b: "", kl: "us-en" }).toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`DDG HTML search returned ${res.status}`);
    }

    const html = await res.text();
    return parseSearchResults(html, maxResults);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse classic web results out of DuckDuckGo's lite HTML page.
 *
 * DDG's HTML page structure (the lite version) is stable and minimal:
 *   <div class="result">
 *     <h2 class="result__title"><a href="...">Title</a></h2>
 *     <a class="result__snippet">Snippet text</a>
 *   </div>
 */
function parseSearchResults(html: string, maxResults: number): WebResult[] {
  const results: WebResult[] = [];

  // Extract result blocks
  const resultBlockRe =
    /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]+class="[^"]*result|<\/div>|$)/gi;

  // Extract title + URL
  const titleRe =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;

  // Extract snippet
  const snippetRe =
    /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i;

  let match: RegExpExecArray | null;

  while (
    (match = resultBlockRe.exec(html)) !== null &&
    results.length < maxResults
  ) {
    const block = match[1];
    const titleMatch = titleRe.exec(block);
    const snippetMatch = snippetRe.exec(block);

    if (!titleMatch) continue;

    const rawUrl = titleMatch[1];
    const title = stripTags(titleMatch[2]).trim();
    const snippet = snippetMatch ? stripTags(snippetMatch[1]).trim() : "";

    // DDG wraps URLs in a redirect — extract the real URL
    const url = extractRealUrl(rawUrl);

    if (!url || !title) continue;

    results.push({ title, url, snippet });
  }

  // Fallback: simpler regex if the block approach found nothing
  if (results.length === 0) {
    const linkRe =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while (
      (match = linkRe.exec(html)) !== null &&
      results.length < maxResults
    ) {
      const url = extractRealUrl(match[1]);
      const title = stripTags(match[2]).trim();
      if (url && title) results.push({ title, url, snippet: "" });
    }
  }

  logger.debug("DDG HTML scrape parsed", { found: results.length });
  return results;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function extractRealUrl(rawUrl: string): string {
  // DDG sometimes uses //duckduckgo.com/l/?uddg=<encoded-url>
  const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    try {
      return decodeURIComponent(uddgMatch[1]);
    } catch {
      return rawUrl;
    }
  }
  // Already a real URL
  if (rawUrl.startsWith("http")) return rawUrl;
  return rawUrl;
}

// ── Combined search (used by tools) ──────────────────────────────────────────

export async function duckDuckGoSearch(
  query: string,
  maxResults: number = config.maxResults
): Promise<DuckDuckGoSearchResponse> {
  // Run both in parallel for speed
  const [instantAnswer, webResults] = await Promise.allSettled([
    fetchInstantAnswer(query),
    scrapeWebResults(query, maxResults),
  ]);

  const ia =
    instantAnswer.status === "fulfilled" ? instantAnswer.value : null;
  const wr =
    webResults.status === "fulfilled" ? webResults.value : [];

  if (webResults.status === "rejected") {
    logger.warn("DDG web scrape failed", {
      error: String(webResults.reason),
    });
  }

  const source =
    ia && wr.length > 0 ? "combined" : ia ? "instant_answer" : "html_scrape";

  return { instantAnswer: ia, webResults: wr, query, source };
}
