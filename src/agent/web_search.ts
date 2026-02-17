export async function webSearch(query: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    );
    
    if (!response.ok) {
      return "Search failed";
    }

    const data = await response.json();
    
    if (!data.AbstractText) {
      return "No results found";
    }

    const results = data.RelatedTopics?.slice(0, 3).map((topic: any) => {
      return `- ${topic.Text}`;
    }).join("\n") || "";

    return `🔍 ${data.AbstractText}\n\n${results}`.slice(0, 2000);
  } catch (error) {
    return `Search error: ${error instanceof Error ? error.message : "Unknown"}`;
  }
}
