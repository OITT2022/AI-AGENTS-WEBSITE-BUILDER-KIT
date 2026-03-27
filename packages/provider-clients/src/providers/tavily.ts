import { BaseProvider, createHttpClient, type ProviderClientConfig } from "../index.js";

export interface TavilyInput {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyOutput {
  results: TavilyResult[];
}

interface TavilyApiResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilyApiResponse {
  results?: TavilyApiResult[];
}

export class TavilyProvider extends BaseProvider<TavilyInput, TavilyOutput> {
  constructor(config: ProviderClientConfig = {}) {
    super("tavily", {
      baseUrl: "https://api.tavily.com",
      ...config,
    });
  }

  protected async doExecute(input: TavilyInput): Promise<TavilyOutput> {
    const client = createHttpClient(this.config.baseUrl!);

    const body = {
      api_key: this.config.apiKey ?? "",
      query: input.query,
      max_results: input.maxResults ?? 10,
      search_depth: input.searchDepth ?? "basic",
    };

    const response = await client.post<TavilyApiResponse>("/search", body);

    const results: TavilyResult[] = (response.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: r.score ?? 0,
    }));

    return { results };
  }
}
