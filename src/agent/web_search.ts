import { logger } from "../utils/logger.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<string> {
  logger.info("Performing web search", { query });
  
  try {
    const results = await searchDuckDuckGo(query);
    
    if (results.length === 0) {
      return "🔍 No results found for this query. Try simplifying your search terms.";
    }

    const formattedResults = results
      .slice(0, 5)
      .map((result, index) => {
        return `${index + 1}. **${result.title}**\n   ${result.snippet}\n   ${result.url}`;
      })
      .join("\n\n");

    return `🔍 Search Results for "${query}":\n\n${formattedResults}`;
  } catch (error) {
    logger.error("Web search failed", { error: String(error), query });
    return `🔍 Search error: ${error instanceof Error ? error.message : "Unknown error"}. The search service might be temporarily unavailable.`;
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
  
  if (results.length === 0) {
    return fallbackSearch(query);
  }
  
  return results;
}

async function fallbackSearch(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.BING_API_KEY || ""
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json() as any;
      return data.webPages?.value?.map((item: any) => ({
        title: item.name,
        url: item.url,
        snippet: item.snippet
      })) || [];
    }
  } catch {
    // Bing not configured or failed
  }
  
  return [];
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

export async function searchWithBrave(query: string, apiKey: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.search.brave.com/api/suggest?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": apiKey
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Brave API returned ${response.status}`);
    }

    const data = await response.json() as any;
    
    const results = data.results?.map((result: any, index: number) => {
      return `${index + 1}. **${result.title}**\n   ${result.description}\n   ${result.url}`;
    }).join("\n\n") || "No results found";

    return `🔍 Search Results:\n\n${results}`;
  } catch (error) {
    return `Search error: ${error instanceof Error ? error.message : "Unknown"}`;
  }
}
