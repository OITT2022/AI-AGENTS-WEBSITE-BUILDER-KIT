import { BaseProvider, createHttpClient, type ProviderClientConfig } from "../index.js";

export interface FirecrawlInput {
  url: string;
  mode?: "scrape" | "crawl";
}

export interface FirecrawlOutput {
  content: string;
  title?: string;
  links?: string[];
}

interface FirecrawlApiData {
  markdown?: string;
  content?: string;
  title?: string;
  links?: string[];
}

interface FirecrawlApiResponse {
  success?: boolean;
  data?: FirecrawlApiData;
}

export class FirecrawlProvider extends BaseProvider<FirecrawlInput, FirecrawlOutput> {
  constructor(config: ProviderClientConfig = {}) {
    super("firecrawl", {
      baseUrl: "https://api.firecrawl.dev/v1",
      ...config,
    });
  }

  protected async doExecute(input: FirecrawlInput): Promise<FirecrawlOutput> {
    const client = createHttpClient(this.config.baseUrl!, {
      Authorization: `Bearer ${this.config.apiKey ?? ""}`,
    });

    const endpoint = input.mode === "crawl" ? "/crawl" : "/scrape";

    const body = { url: input.url };

    const response = await client.post<FirecrawlApiResponse>(endpoint, body);

    if (!response.success) {
      throw new Error("Firecrawl API returned unsuccessful response");
    }

    const data = response.data;
    return {
      content: data?.markdown ?? data?.content ?? "",
      title: data?.title,
      links: data?.links,
    };
  }
}
