import axios, { AxiosInstance } from "axios";
import { PropertyRecord } from "../../domain/PropertyRecord.js";

export interface GeneratedImageResult {
  promptUsed: string;
  imageUrls: string[];
}

export class NanoBananaClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 45000
    });
  }

  async enhancePropertyImages(property: PropertyRecord, shortBody: string): Promise<GeneratedImageResult> {
    const prompt = [
      "Enhance this real estate image package for premium property marketing.",
      "Keep the architecture realistic.",
      "Improve lighting, sky, contrast, staging feel, premium brochure look.",
      `Headline intent: ${shortBody}`,
      `Property: ${property.title}`,
      `Location: ${property.city ?? ""}, ${property.country ?? ""}`
    ].join(" ");

    const response = await this.http.post("/generate/real-estate-images", {
      propertyId: property.id,
      prompt,
      sourceImages: property.images
    });

    return {
      promptUsed: prompt,
      imageUrls: response.data?.imageUrls ?? property.images
    };
  }
}
