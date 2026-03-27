export interface GeneratedContent {
  text: string;
  language: string;
  tokensUsed: number;
}

export interface ContentGenerationOptions {
  type?: string;
  tone?: string;
  maxWords?: number;
  keywords?: string[];
  language?: string;
}

export interface ContentProvider {
  name: string;
  generate(prompt: string, options?: ContentGenerationOptions): Promise<GeneratedContent>;
}
