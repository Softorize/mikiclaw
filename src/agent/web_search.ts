import { logger } from "../utils/logger.js";
import { browserSearch } from "../tools/browser_search.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<string> {
  logger.info("Performing web search", { query });

  try {
    const browserResults = await browserSearch(query);
    if (!browserResults.includes("No results found") && !browserResults.includes("Search error")) {
      return browserResults;
    }

    const serperApiKey = process.env.SERPER_API_KEY?.trim();
    if (serperApiKey) {
      logger.info("Trying Serper API fallback", { query });
      const serperResults = await searchWithSerper(query, serperApiKey);
      if (serperResults.length > 0) {
        return formatResults(query, serperResults);
      }
    }

    const ddgResults = await searchDuckDuckGo(query);
    if (ddgResults.length > 0) {
      return formatResults(query, ddgResults);
    }

    const bingResults = await searchWithBingRss(query);
    if (bingResults.length > 0) {
      return formatResults(query, bingResults);
    }

    const instantResults = await searchDuckDuckGoInstant(query);
    if (instantResults.length > 0) {
      return formatResults(query, instantResults);
    }

    return "🔍 No results found for this query. Try adding more context or an alternate spelling.";
  } catch (error) {
    logger.error("Web search failed", { error: String(error), query });
    return `🔍 Search error: ${error instanceof Error ? error.message : "Unknown error"}. The search service might be temporarily unavailable.`;
  }
}

function formatResults(query: string, results: SearchResult[]): string {
  const formattedResults = results
    .slice(0, 5)
    .map((result, index) => `${index + 1}. **${result.title}**\n   ${result.snippet}\n   ${result.url}`)
    .join("\n\n");

  return `🔍 Search Results for "${query}":\n\n${formattedResults}`;
}

function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankByQueryMatch(results: SearchResult[], query: string): SearchResult[] {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .map(token => token.trim())
    .filter(token => token.length > 2);

  if (tokens.length === 0) {
    return results;
  }

  return results
    .map(result => {
      const haystack = `${result.title} ${result.snippet}`.toLowerCase();
      const score = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);
      return { result, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.result);
}

async function searchWithSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: query, num: 10 })
    });

    if (!response.ok) {
      throw new Error(`Serper API returned ${response.status}`);
    }

    const data = await response.json() as any;
    const results: SearchResult[] = [];

    if (Array.isArray(data.organic)) {
      for (const item of data.organic.slice(0, 8)) {
        results.push({
          title: item.title || "No title",
          url: item.link || "",
          snippet: item.snippet || "No description available"
        });
      }
    }

    if (results.length === 0 && data.answerBox) {
      results.push({
        title: data.answerBox.title || "Answer",
        url: data.answerBox.link || "",
        snippet: data.answerBox.snippet || data.answerBox.answer || ""
      });
    }

    return rankByQueryMatch(results, query).filter(item => item.url.startsWith("http"));
  } catch (error) {
    logger.error("Serper search failed", { error: String(error) });
    return [];
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    if (html.toLowerCase().includes("anomaly-modal") || html.toLowerCase().includes("bots use duckduckgo too")) {
      logger.warn("DuckDuckGo returned anti-bot challenge");
      return [];
    }

    const results: SearchResult[] = [];
    const blocks = html.split('class="result"').slice(1);

    for (const block of blocks.slice(0, 10)) {
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const urlMatch = block.match(/href="([^"]+)"/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[^>]+>/);

      if (!titleMatch || !urlMatch) {
        continue;
      }

      const rawUrl = urlMatch[1];
      const cleanedUrl = rawUrl.startsWith("/l/?")
        ? decodeURIComponent(rawUrl.replace(/^\/l\/\?kh=-?\d+&uddg=/, ""))
        : rawUrl;

      results.push({
        title: decodeHtml(titleMatch[1]),
        url: cleanedUrl,
        snippet: snippetMatch ? decodeHtml(snippetMatch[1]) : "No description available"
      });
    }

    return rankByQueryMatch(results, query).filter(item => item.url.startsWith("http"));
  } catch (error) {
    logger.error("DuckDuckGo search failed", { error: String(error) });
    return [];
  }
}

async function searchWithBingRss(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    if (!response.ok) {
      throw new Error(`Bing RSS returned ${response.status}`);
    }

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const results: SearchResult[] = [];

    for (const item of items.slice(0, 10)) {
      const title = decodeHtml((item.match(/<title>([\s\S]*?)<\/title>/)?.[1]) || "No title");
      const url = decodeHtml((item.match(/<link>([\s\S]*?)<\/link>/)?.[1]) || "");
      const snippet = decodeHtml((item.match(/<description>([\s\S]*?)<\/description>/)?.[1]) || "No description available");

      if (!url.startsWith("http")) {
        continue;
      }

      results.push({ title, url, snippet });
    }

    return rankByQueryMatch(results, query);
  } catch (error) {
    logger.error("Bing RSS search failed", { error: String(error) });
    return [];
  }
}

async function searchDuckDuckGoInstant(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo Instant returned ${response.status}`);
    }

    const data = await response.json() as any;
    const results: SearchResult[] = [];

    if (data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText || "No description available"
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 8)) {
        if (topic && typeof topic === "object" && topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text
          });
        }
      }
    }

    return rankByQueryMatch(results, query).filter(item => item.url.startsWith("http"));
  } catch (error) {
    logger.error("DuckDuckGo instant search failed", { error: String(error) });
    return [];
  }
}
