import axios, { AxiosInstance } from "axios";
import { PropertyRecord } from "../../domain/PropertyRecord.js";
import { AdCopy } from "../../domain/AdCopy.js";

export class ShotstackClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string, apiKey: string, ownerId?: string) {
    this.http = axios.create({
      baseURL,
      headers: {
        "x-api-key": apiKey,
        ...(ownerId ? { "x-shotstack-owner": ownerId } : {}),
        "Content-Type": "application/json"
      },
      timeout: 45000
    });
  }

  async createPromoVideo(property: PropertyRecord, copy: AdCopy, imageUrls: string[]): Promise<string> {
    const clips = imageUrls.slice(0, 4).map((imageUrl, index) => ({
      asset: { type: "image", src: imageUrl },
      start: index * 4,
      length: 4,
      fit: "cover"
    }));

    const response = await this.http.post("/render", {
      timeline: {
        background: "#000000",
        soundtrack: { src: "https://cdn.shotstack.io/music/freeflow.mp3", volume: 0.15 },
        tracks: [
          { clips },
          {
            clips: [
              {
                asset: {
                  type: "title",
                  text: copy.headline,
                  style: "minimal",
                  size: "x-large"
                },
                start: 0,
                length: 4,
                position: "center"
              },
              {
                asset: {
                  type: "title",
                  text: copy.callToAction,
                  style: "minimal",
                  size: "small"
                },
                start: Math.max(0, clips.length * 4 - 3),
                length: 3,
                position: "bottom"
              }
            ]
          }
        ]
      },
      output: {
        format: "mp4",
        resolution: "sd"
      },
      merge: [{ find: "{{price}}", replace: `${property.price} ${property.currency}` }]
    });

    return response.data?.response?.url ?? response.data?.url ?? "";
  }
}
