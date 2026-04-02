import { PropertyApiClient } from "../infra/property_api/PropertyApiClient.js";
import { ClaudeCopyClient } from "../infra/claude/ClaudeCopyClient.js";
import { NanoBananaClient } from "../infra/nano_banana/NanoBananaClient.js";
import { ShotstackClient } from "../infra/shotstack/ShotstackClient.js";
import { CanvaClient } from "../infra/canva/CanvaClient.js";
import { FileStorage } from "../infra/storage/FileStorage.js";
import { PublishClient } from "../infra/storage/PublishClient.js";
import { CreativeAsset } from "../domain/CreativeAsset.js";
import { LoggerLike } from "../infra/logger/consoleLogger.js";

export interface CreateAdInput {
  propertyId: string;
  channel: string;
  publish?: boolean;
}

export interface CreateAdOutput {
  propertyId: string;
  channel: string;
  assets: CreativeAsset[];
  summaryUrl?: string;
}

export class AdGenerationOrchestrator {
  constructor(
    private readonly propertyApiClient: PropertyApiClient,
    private readonly claudeCopyClient: ClaudeCopyClient,
    private readonly nanoBananaClient: NanoBananaClient,
    private readonly shotstackClient: ShotstackClient,
    private readonly canvaClient: CanvaClient,
    private readonly fileStorage: FileStorage,
    private readonly publishClient: PublishClient,
    private readonly logger: LoggerLike
  ) {}

  async run(input: CreateAdInput): Promise<CreateAdOutput> {
    this.logger.info({ input }, "Starting ad generation");

    const property = await this.propertyApiClient.getProperty(input.propertyId);
    const copy = await this.claudeCopyClient.generateHebrewCopy(property, input.channel);
    const imageBatch = await this.nanoBananaClient.enhancePropertyImages(property, copy.shortBody);
    const videoUrl = await this.shotstackClient.createPromoVideo(property, copy, imageBatch.imageUrls);
    const canvaDesign = await this.canvaClient.buildDesign(property, copy, imageBatch.imageUrls[0] ?? property.images[0], videoUrl);

    const assets: CreativeAsset[] = [
      ...imageBatch.imageUrls.map((url, index) => ({ type: "image" as const, url, label: `enhanced-image-${index + 1}` })),
      { type: "video" as const, url: videoUrl, label: "promo-video" },
      { type: "canva_design" as const, url: canvaDesign.designUrl, label: "canva-design", metadata: { designId: canvaDesign.designId } }
    ];

    const summaryUrl = await this.fileStorage.writeJson(`ad-summary-${property.id}.json`, {
      input,
      property,
      copy,
      assets,
      canvaDesign,
      imagePrompt: imageBatch.promptUsed
    });

    if (input.publish) {
      await this.publishClient.publish({ propertyId: property.id, channel: input.channel, assets, summaryUrl });
    }

    this.logger.info({ propertyId: property.id, summaryUrl }, "Ad generation completed");

    return {
      propertyId: property.id,
      channel: input.channel,
      assets,
      summaryUrl
    };
  }
}
