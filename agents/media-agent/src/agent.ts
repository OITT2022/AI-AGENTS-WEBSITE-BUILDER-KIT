import {
  MediaInputSchema,
  MediaOutputSchema,
  type MediaInput,
  type MediaOutput,
} from "./schemas.js";
import type { MediaProvider, MediaResult } from "./provider.js";
import { buildMediaPrompt } from "./prompts.js";

export class MediaAgent {
  private readonly providers: Map<string, MediaProvider>;

  constructor(providers: Map<string, MediaProvider>) {
    this.providers = providers;
  }

  async run(input: unknown): Promise<MediaOutput> {
    const validated = MediaInputSchema.parse(input);
    const prompt = buildMediaPrompt(validated);

    const provider = this.selectProvider(validated.type);
    if (!provider) {
      throw new Error(
        `No provider available for media type: ${validated.type}`,
      );
    }

    const result: MediaResult = await provider.generate(prompt, {
      style: validated.style,
      dimensions: validated.dimensions,
      format: validated.format,
    });

    const output: MediaOutput = {
      url: result.url,
      type: validated.type,
      provider: provider.name,
      format: result.format,
      dimensions: result.dimensions,
      metadata: result.metadata,
    };

    return MediaOutputSchema.parse(output);
  }

  private selectProvider(type: MediaInput["type"]): MediaProvider | undefined {
    // First try to find a provider matching the exact type
    for (const provider of this.providers.values()) {
      if (provider.type === type) {
        return provider;
      }
    }

    // Fall back to any available provider
    return this.providers.values().next().value as MediaProvider | undefined;
  }
}
