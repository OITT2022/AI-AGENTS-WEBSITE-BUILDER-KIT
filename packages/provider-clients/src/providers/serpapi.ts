import { BaseProvider, createHttpClient, type ProviderClientConfig } from "../index.js";

export interface SerpApiInput {
  query: string;
  engine?: string;
  location?: string;
}

export interface SerpApiResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerpApiOutput {
  results: SerpApiResult[];
}

interface SerpApiOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
}

export class SerpApiProvider extends BaseProvider<SerpApiInput, SerpApiOutput> {
  constructor(config: ProviderClientConfig = {}) {
    super("serpapi", {
      baseUrl: "https://serpapi.com",
      ...config,
    });
  }

  protected async doExecute(input: SerpApiInput): Promise<SerpApiOutput> {
    const client = createHttpClient(this.config.baseUrl!);

    const params: Record<string, string> = {
      api_key: this.config.apiKey ?? "",
      q: input.query,
      engine: input.engine ?? "google",
    };

    if (input.location) {
      params["location"] = input.location;
    }

    const qs = new URLSearchParams(params).toString();
    const response = await client.get<SerpApiResponse>(`/search.json?${qs}`);

    const results: SerpApiResult[] = (response.organic_results ?? []).map(
      (r, i) => ({
        title: r.title ?? "",
        link: r.link ?? "",
        snippet: r.snippet ?? "",
        position: r.position ?? i + 1,
      }),
    );

    return { results };
  }
}
