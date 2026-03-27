import { BaseProvider, type ProviderClientConfig } from "../index.js";

export interface ImageInput {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
}

export interface ImageOutput {
  imageUrl: string;
  format: string;
}

export class ImageProvider extends BaseProvider<ImageInput, ImageOutput> {
  constructor(config: ProviderClientConfig = {}) {
    super("image", config);
  }

  protected async doExecute(input: ImageInput): Promise<ImageOutput> {
    const w = input.width ?? 1024;
    const h = input.height ?? 1024;

    // Placeholder implementation — returns a stub URL
    return {
      imageUrl: `https://placeholder.example.com/image/${w}x${h}?prompt=${encodeURIComponent(input.prompt)}&style=${encodeURIComponent(input.style ?? "default")}`,
      format: "png",
    };
  }
}
