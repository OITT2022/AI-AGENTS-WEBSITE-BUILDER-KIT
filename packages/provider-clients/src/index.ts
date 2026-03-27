// ── Response type ──

export interface ProviderResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  duration?: number;
}

// ── Provider client interface ──

export interface ProviderClient<TInput, TOutput> {
  name: string;
  execute(input: TInput): Promise<ProviderResponse<TOutput>>;
}

// ── Provider config ──

export interface ProviderClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

// ── Abstract base provider ──

export abstract class BaseProvider<TInput, TOutput> implements ProviderClient<TInput, TOutput> {
  public readonly name: string;
  protected readonly config: ProviderClientConfig;

  constructor(name: string, config: ProviderClientConfig = {}) {
    this.name = name;
    this.config = config;
  }

  protected abstract doExecute(input: TInput): Promise<TOutput>;

  async execute(input: TInput): Promise<ProviderResponse<TOutput>> {
    const start = Date.now();
    try {
      const data = await this.doExecute(input);
      return {
        ok: true,
        data,
        duration: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: message,
        duration: Date.now() - start,
      };
    }
  }
}

// ── Simple HTTP client factory ──

export interface HttpClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
}

export function createHttpClient(baseUrl: string, headers?: Record<string, string>): HttpClient {
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    const init: RequestInit = {
      method,
      headers: defaultHeaders,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  return {
    get: <T = unknown>(path: string) => request<T>("GET", path),
    post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body),
  };
}

// ── Legacy helper ──

export async function notImplementedProvider<T>(name: string): Promise<ProviderResponse<T>> {
  return { ok: false, error: `${name} provider not implemented` };
}

// ── Provider adapters ──

export { PerplexityProvider } from "./providers/perplexity.js";
export type { PerplexityInput, PerplexityOutput, PerplexityResult } from "./providers/perplexity.js";

export { TavilyProvider } from "./providers/tavily.js";
export type { TavilyInput, TavilyOutput, TavilyResult } from "./providers/tavily.js";

export { FirecrawlProvider } from "./providers/firecrawl.js";
export type { FirecrawlInput, FirecrawlOutput } from "./providers/firecrawl.js";

export { SerpApiProvider } from "./providers/serpapi.js";
export type { SerpApiInput, SerpApiOutput, SerpApiResult } from "./providers/serpapi.js";

export { WebFetchProvider } from "./providers/web-fetch.js";
export type { WebFetchInput, WebFetchOutput } from "./providers/web-fetch.js";

export { ImageProvider } from "./providers/image.js";
export type { ImageInput, ImageOutput } from "./providers/image.js";

export { ChartProvider } from "./providers/chart.js";
export type { ChartInput, ChartOutput } from "./providers/chart.js";

export { VideoProvider } from "./providers/video.js";
export type { VideoInput, VideoOutput } from "./providers/video.js";

export { NanoBananaProvider } from "./providers/nano-banana.js";
export type { NanoBananaInput, NanoBananaOutput } from "./providers/nano-banana.js";

export { GitHubClient } from "./providers/github.js";
export type { CreateRepoOptions, CreateRepoResult } from "./providers/github.js";

export { VercelClient } from "./providers/vercel.js";
export type { DeploySource, DeployResult, DeploymentStatus } from "./providers/vercel.js";
