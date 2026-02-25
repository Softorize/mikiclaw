export interface ToolExecutionContext {
  chatId?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  success: boolean;
  results?: SearchResult[];
  error?: string;
  query?: string;
}
