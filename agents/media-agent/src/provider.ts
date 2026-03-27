export interface MediaGenerationOptions {
  style?: string;
  dimensions?: { width: number; height: number };
  format?: string;
}

export interface MediaResult {
  url: string;
  format: string;
  dimensions?: { width: number; height: number };
  metadata?: Record<string, unknown>;
}

export interface MediaProvider {
  name: string;
  type: "image" | "chart" | "video";
  generate(prompt: string, options?: MediaGenerationOptions): Promise<MediaResult>;
}
