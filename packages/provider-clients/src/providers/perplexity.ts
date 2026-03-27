import { BaseProvider, createHttpClient, type ProviderClientConfig } from "../index.js";

export interface PerplexityInput {
  query: string;
  maxResults?: number;
}

export interface PerplexityResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface PerplexityOutput {
  results: PerplexityResult[];
}

interface PerplexityApiChoice {
  message?: { content?: string };
}

interface PerplexityApiCitation {
  url?: string;
  title?: string;
  snippet?: string;
}

interface PerplexityApiResponse {
  choices?: PerplexityApiChoice[];
  citations?: PerplexityApiCitation[];
}

export class PerplexityProvider extends BaseProvider<PerplexityInput, PerplexityOutput> {
  constructor(config: ProviderClientConfig = {}) {
    super("perplexity", {
      baseUrl: "https://api.perplexity.ai",
      ...config,
    });
  }

  protected async doExecute(input: PerplexityInput): Promise<PerplexityOutput> {
    const client = createHttpClient(this.config.baseUrl!, {
      Authorization: `Bearer ${this.config.apiKey ?? ""}`,
    });

    const body = {
      model: "sonar",
      messages: [{ role: "user", content: input.query }],
      max_tokens: input.maxResults ? input.maxResults * 200 : undefined,
    };

    const response = await client.post<PerplexityApiResponse>(
      "/chat/completions",
      body,
    );

    const citations = response.citations ?? [];
    const results: PerplexityResult[] = citations
      .slice(0, input.maxResults ?? 10)
      .map((c, i) => ({
        title: c.title ?? "",
        url: c.url ?? "",
        snippet: c.snippet ?? "",
        score: 1 - i * 0.05,
      }));

    return { results };
  }
}
