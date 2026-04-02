import "dotenv/config";
import { envSchema } from "../types/env.js";
import { PropertyApiClient } from "../infra/property_api/PropertyApiClient.js";
import { ClaudeCopyClient } from "../infra/claude/ClaudeCopyClient.js";
import { NanoBananaClient } from "../infra/nano_banana/NanoBananaClient.js";
import { ShotstackClient } from "../infra/shotstack/ShotstackClient.js";
import { CanvaClient } from "../infra/canva/CanvaClient.js";
import { FileStorage } from "../infra/storage/FileStorage.js";
import { PublishClient } from "../infra/storage/PublishClient.js";
import { AdGenerationOrchestrator } from "../application/AdGenerationOrchestrator.js";
import { consoleLogger } from "../infra/logger/consoleLogger.js";

const env = envSchema.parse(process.env);
const args = process.argv.slice(2);

const propertyId = args.find((item) => item.startsWith("--propertyId="))?.split("=")[1];
const channel = args.find((item) => item.startsWith("--channel="))?.split("=")[1] ?? "instagram";
const publish = args.includes("--publish=true");

if (!propertyId) {
  throw new Error("Missing --propertyId argument");
}

const orchestrator = new AdGenerationOrchestrator(
  new PropertyApiClient(env.PROPERTY_API_BASE_URL, env.PROPERTY_API_KEY),
  new ClaudeCopyClient(env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL),
  new NanoBananaClient(env.NANO_BANANA_API_BASE_URL, env.NANO_BANANA_API_KEY),
  new ShotstackClient(env.SHOTSTACK_API_BASE_URL, env.SHOTSTACK_API_KEY, env.SHOTSTACK_OWNER_ID),
  new CanvaClient(env.CANVA_API_BASE_URL, env.CANVA_ACCESS_TOKEN, env.CANVA_BRAND_TEMPLATE_ID, env.CANVA_ASSET_FOLDER),
  new FileStorage(env.OUTPUT_DIR, env.PUBLIC_ASSET_BASE_URL),
  new PublishClient(env.EXISTING_PUBLISHER_WEBHOOK),
  consoleLogger
);

const result = await orchestrator.run({ propertyId, channel, publish });
console.log(JSON.stringify(result, null, 2));
