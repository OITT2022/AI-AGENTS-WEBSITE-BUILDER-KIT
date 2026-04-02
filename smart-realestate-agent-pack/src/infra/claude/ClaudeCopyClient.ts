import axios, { AxiosInstance } from "axios";
import { PropertyRecord } from "../../domain/PropertyRecord.js";
import { AdCopy } from "../../domain/AdCopy.js";

export class ClaudeCopyClient {
  private readonly http: AxiosInstance;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.http = axios.create({
      baseURL: "https://api.anthropic.com/v1",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      timeout: 30000
    });
  }

  async generateHebrewCopy(property: PropertyRecord, channel: string): Promise<AdCopy> {
    const prompt = [
      "You are a luxury real estate marketing strategist.",
      "Return concise, strong, publishable Hebrew marketing copy as JSON only.",
      `Target channel: ${channel}`,
      `Property title: ${property.title}`,
      `Description: ${property.description}`,
      `Price: ${property.price} ${property.currency}`,
      `Location: ${property.city ?? ""}, ${property.country ?? ""}`,
      `Features: ${property.features.join(", ")}`,
      'JSON schema: {"headline":"","shortBody":"","longBody":"","callToAction":"","hashtags":[""],"language":"he"}'
    ].join("\n");

    const response = await this.http.post("/messages", {
      model: this.model,
      max_tokens: 700,
      temperature: 0.6,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.data?.content?.[0]?.text;
    if (!text) {
      throw new Error("Claude response did not include text content");
    }

    return JSON.parse(text) as AdCopy;
  }
}
