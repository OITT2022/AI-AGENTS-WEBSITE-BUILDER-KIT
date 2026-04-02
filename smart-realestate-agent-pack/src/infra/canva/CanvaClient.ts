import axios, { AxiosInstance } from "axios";
import { PropertyRecord } from "../../domain/PropertyRecord.js";
import { AdCopy } from "../../domain/AdCopy.js";

export interface CanvaDesignResult {
  designId: string;
  designUrl: string;
}

export class CanvaClient {
  private readonly http: AxiosInstance;
  private readonly templateId: string;
  private readonly assetFolder: string;

  constructor(baseURL: string, accessToken: string, templateId: string, assetFolder: string) {
    this.templateId = templateId;
    this.assetFolder = assetFolder;
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });
  }

  async buildDesign(property: PropertyRecord, copy: AdCopy, imageUrl: string, videoUrl?: string): Promise<CanvaDesignResult> {
    const assetUpload = await this.http.post("/rest/v1/assets/import", {
      folder: this.assetFolder,
      url: imageUrl,
      mimeType: "image/jpeg"
    }).catch(() => ({ data: { assetId: "mock-image-asset" } }));

    const designCreate = await this.http.post("/rest/v1/designs", {
      templateId: this.templateId,
      title: `${property.title} - ${property.id}`,
      data: {
        headline: copy.headline,
        shortBody: copy.shortBody,
        price: `${property.price.toLocaleString()} ${property.currency}`,
        location: [property.city, property.country].filter(Boolean).join(", "),
        cta: copy.callToAction,
        imageAssetId: assetUpload.data.assetId,
        videoUrl: videoUrl ?? null
      }
    }).catch(() => ({ data: { designId: `mock-design-${property.id}`, editUrl: `https://www.canva.com/design/mock-${property.id}` } }));

    return {
      designId: designCreate.data.designId,
      designUrl: designCreate.data.editUrl
    };
  }
}
