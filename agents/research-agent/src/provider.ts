export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
  provider: string;
}

export interface SearchOptions {
  language?: string;
  domains?: string[];
  maxResults?: number;
}

export interface ResearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
