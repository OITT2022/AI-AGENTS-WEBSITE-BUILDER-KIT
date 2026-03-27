import { BaseProvider, type ProviderClientConfig } from "../index.js";

export interface WebFetchInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface WebFetchOutput {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export class WebFetchProvider extends BaseProvider<WebFetchInput, WebFetchOutput> {
  constructor(config: ProviderClientConfig = {}) {
    super("web-fetch", config);
  }

  protected async doExecute(input: WebFetchInput): Promise<WebFetchOutput> {
    const res = await fetch(input.url, {
      method: input.method ?? "GET",
      headers: input.headers,
      signal: this.config.timeout
        ? AbortSignal.timeout(this.config.timeout)
        : undefined,
    });

    const body = await res.text();

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: res.status,
      body,
      headers,
    };
  }
}
