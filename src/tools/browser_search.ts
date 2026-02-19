import { chromium, Browser, Page } from "playwright";
import { logger } from "../utils/logger.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

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
        "--disable-blink-features=AutomationControlled",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      ]
    });
  }
  return browser;
}

export async function browserSearch(query: string): Promise<string> {
  logger.info("Performing browser-based search", { query });
  
  let page: Page | null = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Navigate to Google
    await page.goto("https://www.google.com/search?q=" + encodeURIComponent(query), {
      waitUntil: "networkidle",
      timeout: 30000
    });
    
    // Wait for search results to load
    await page.waitForSelector("#search", { timeout: 10000 }).catch(() => {
      logger.warn("Could not find #search selector, trying alternative");
    });
    
    // Extract search results
    const results = await page.evaluate(() => {
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      
      // Try multiple selectors for different Google layouts
      const selectors = [
        ".g", // Standard search result
        "[data-ved] div[data-sokoban-container]", // Alternative layout
        "div.gs_ri", // Yet another layout
        "#rso .g" // Search results container
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        for (const element of Array.from(elements).slice(0, 5)) {
          const titleEl = element.querySelector("h3") || 
                         element.querySelector("a > div") ||
                         element.querySelector("[role='heading']");
          const linkEl = element.querySelector("a[href^='http']") ||
                        element.querySelector("a[href^='/url']");
          const snippetEl = element.querySelector(".VwiC3b") ||
                           element.querySelector(".s3v94d") ||
                           element.querySelector("span:not([class])");
          
          if (titleEl && linkEl) {
            let url = linkEl.getAttribute("href") || "";
            // Clean up Google redirect URLs
            if (url.startsWith("/url?")) {
              const match = url.match(/[?&]url=([^&]+)/);
              if (match) {
                url = decodeURIComponent(match[1]);
              }
            }
            
            results.push({
              title: titleEl.textContent?.trim() || "No title",
              url: url,
              snippet: snippetEl?.textContent?.trim() || "No description available"
            });
          }
        }
        
        if (results.length > 0) break;
      }
      
      return results;
    });
    
    if (results.length === 0) {
      return "🔍 No results found. Google might be showing a CAPTCHA or the page layout has changed.";
    }
    
    const formattedResults = results
      .slice(0, 5)
      .map((result, index) => {
        return `${index + 1}. **${result.title}**\n   ${result.snippet}\n   ${result.url}`;
      })
      .join("\n\n");
    
    return `🔍 Search Results for "${query}":\n\n${formattedResults}`;
    
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

// Graceful shutdown
process.on("exit", () => {
  closeBrowser().catch(() => {});
});

process.on("SIGINT", () => {
  closeBrowser().catch(() => {});
});
