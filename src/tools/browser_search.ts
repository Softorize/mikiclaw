import { chromium, Browser, Page } from "playwright";
import { logger } from "../utils/logger.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled"
      ]
    });
  }
  return browser;
}

function formatResults(query: string, results: SearchResult[]): string {
  const formattedResults = results
    .slice(0, 5)
    .map((result, index) => `${index + 1}. **${result.title}**\n   ${result.snippet}\n   ${result.url}`)
    .join("\n\n");

  return `🔍 Search Results for "${query}":\n\n${formattedResults}`;
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const result of results) {
    const key = `${result.title}::${result.url}`;
    if (seen.has(key)) {
      continue;
    }

    if (!result.url.startsWith("http")) {
      continue;
    }

    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

async function extractGoogleResults(page: Page): Promise<SearchResult[]> {
  await page.waitForSelector("#search, #rso, .g", { timeout: 8000 }).catch(() => {
    logger.warn("Google results selector not found");
  });

  return await page.evaluate(() => {
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const candidates = document.querySelectorAll(".g, #rso .g, [data-ved] div[data-sokoban-container]");

    for (const element of Array.from(candidates).slice(0, 12)) {
      const titleEl = element.querySelector("h3") || element.querySelector("[role='heading']");
      const linkEl = element.querySelector("a[href]") as HTMLAnchorElement | null;
      const snippetEl =
        element.querySelector(".VwiC3b") ||
        element.querySelector(".s3v94d") ||
        element.querySelector(".st") ||
        element.querySelector("span");

      if (!titleEl || !linkEl) {
        continue;
      }

      let url = linkEl.getAttribute("href") || "";
      if (url.startsWith("/url?")) {
        const match = url.match(/[?&]url=([^&]+)/);
        if (match) {
          url = decodeURIComponent(match[1]);
        }
      }

      results.push({
        title: titleEl.textContent?.trim() || "No title",
        url,
        snippet: snippetEl?.textContent?.trim() || "No description available"
      });
    }

    return results;
  });
}

async function extractBraveResults(page: Page): Promise<SearchResult[]> {
  await page.waitForSelector(".snippet, .search-snippet-title", { timeout: 8000 }).catch(() => {
    logger.warn("Brave results selector not found");
  });

  return await page.evaluate(() => {
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const candidates = document.querySelectorAll("div.snippet[data-type='web'], div.snippet");

    for (const element of Array.from(candidates).slice(0, 15)) {
      const linkEl = element.querySelector("a[href]") as HTMLAnchorElement | null;
      const titleEl = element.querySelector(".search-snippet-title, .title, h2, h3");
      const snippetEl = element.querySelector(".generic-snippet .content, .content, p");

      if (!linkEl || !titleEl) {
        continue;
      }

      const url = linkEl.getAttribute("href") || "";
      results.push({
        title: titleEl.textContent?.trim() || "No title",
        url,
        snippet: snippetEl?.textContent?.trim() || "No description available"
      });
    }

    return results;
  });
}

async function extractBingResults(page: Page): Promise<SearchResult[]> {
  await page.waitForSelector("#b_results, li.b_algo", { timeout: 8000 }).catch(() => {
    logger.warn("Bing results selector not found");
  });

  return await page.evaluate(() => {
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const candidates = document.querySelectorAll("li.b_algo, .b_algo");

    for (const element of Array.from(candidates).slice(0, 12)) {
      const linkEl = element.querySelector("h2 a[href], a[href]") as HTMLAnchorElement | null;
      const titleEl = element.querySelector("h2, .b_title") || linkEl;
      const snippetEl = element.querySelector(".b_caption p, .b_caption, p");

      if (!linkEl || !titleEl) {
        continue;
      }

      results.push({
        title: titleEl.textContent?.trim() || "No title",
        url: linkEl.getAttribute("href") || "",
        snippet: snippetEl?.textContent?.trim() || "No description available"
      });
    }

    return results;
  });
}

async function trySearchEngine(page: Page, query: string, engine: "google" | "brave" | "bing"): Promise<SearchResult[]> {
  if (engine === "google") {
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    return dedupeResults(await extractGoogleResults(page));
  }

  if (engine === "brave") {
    await page.goto(`https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    return dedupeResults(await extractBraveResults(page));
  }

  await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  return dedupeResults(await extractBingResults(page));
}

export async function browserSearch(query: string): Promise<string> {
  logger.info("Performing browser-based search", { query });

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage({ userAgent: USER_AGENT });

    const engines: Array<"google" | "brave" | "bing"> = ["google", "brave", "bing"];

    for (const engine of engines) {
      try {
        const results = await trySearchEngine(page, query, engine);
        if (results.length > 0) {
          logger.info("Browser search succeeded", { engine, resultCount: results.length });
          return formatResults(query, results);
        }

        logger.warn("Search engine returned no results", { engine, query });
      } catch (error) {
        logger.warn("Search engine failed", { engine, query, error: String(error) });
      }
    }

    return "🔍 No results found. Search engines may be blocking automated requests for this query.";
  } catch (error) {
    logger.error("Browser search failed", { error: String(error), query });
    return `🔍 Search error: ${error instanceof Error ? error.message : "Unknown error"}. The browser might need to be restarted.`;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info("Browser closed");
  }
}

process.on("exit", () => {
  closeBrowser().catch(() => {});
});

process.on("SIGINT", () => {
  closeBrowser().catch(() => {});
});
