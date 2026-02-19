import { logger } from "../utils/logger.js";
import { browserSearch } from "../tools/browser_search.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Default Serper API key for mikiclaw (fallback)
const SERPER_API_KEY = "6eff15225f04226d872258d6daac94757679efb4";

export async function webSearch(query: string): Promise<string> {
  logger.info("Performing web search", { query });
  
  try {
    // Try browser-based search first (like OpenClaw does!)
    const browserResults = await browserSearch(query);
    
    // If browser search succeeded and got results, return them
    if (!browserResults.includes("No results found") && !browserResults.includes("error")) {
      logger.info("Browser search succeeded");
      return browserResults;
    }
    
    // Fallback to Serper API
    logger.info("Browser search failed or returned no results, trying Serper API");
    const serperResults = await searchWithSerper(query);
    
    if (serperResults.length > 0) {
      return formatResults(query, serperResults);
    }
    
    // Last fallback to DuckDuckGo
    const ddgResults = await searchDuckDuckGo(query);
    if (ddgResults.length > 0) {
      return formatResults(query, ddgResults);
    }
    
    return "🔍 No results found for this query. Try simplifying your search terms.";
  } catch (error) {
    logger.error("Web search failed", { error: String(error), query });
    return `🔍 Search error: ${error instanceof Error ? error.message : "Unknown error"}. The search service might be temporarily unavailable.`;
  }
}

function formatResults(query: string, results: SearchResult[]): string {
  const formattedResults = results
    .slice(0, 5)
    .map((result, index) => {
      return `${index + 1}. **${result.title}**\n   ${result.snippet}\n   ${result.url}`;
    })
    .join("\n\n");

  return `🔍 Search Results for "${query}":\n\n${formattedResults}`;
}

async function searchWithSerper(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        num: 10
      })
    });
    
    if (!response.ok) {
      throw new Error(`Serper API returned ${response.status}`);
    }

    const data = await response.json() as any;
    
    const results: SearchResult[] = [];
    
    if (data.organic && Array.isArray(data.organic)) {
      for (const item of data.organic.slice(0, 5)) {
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
    
    logger.info("Serper search completed", { resultCount: results.length });
    return results;
  } catch (error) {
    logger.error("Serper search failed", { error: String(error) });
    return [];
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    const resultBlocks = html.split('class="result"').slice(1);
    
    for (const block of resultBlocks.slice(0, 5)) {
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
      const urlMatch = block.match(/href="([^"]+)"/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)/);
      
      if (titleMatch && urlMatch) {
        results.push({
          title: cleanHtml(titleMatch[1]),
          url: decodeURIComponent(urlMatch[1].replace(/^\/l\/\?kh=-?\d+&uddg=/, "")),
          snippet: snippetMatch ? cleanHtml(snippetMatch[1]) : "No description available"
        });
      }
    }
  } catch (error) {
    logger.error("DuckDuckGo search failed", { error: String(error) });
  }
  
  return results;
}

function cleanHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
