import "dotenv/config";
import express from "express";
import { z } from "zod";
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
const app = express();
app.use(express.json({ limit: "5mb" }));

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

const createAdSchema = z.object({
  propertyId: z.string().min(1),
  channel: z.string().default("instagram"),
  publish: z.boolean().optional()
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "smart-realestate-agent" });
});

app.post("/agent/create-ad", async (req, res) => {
  try {
    const body = createAdSchema.parse(req.body);
    const result = await orchestrator.run(body);
    res.json({ ok: true, result });
  } catch (error) {
    consoleLogger.error(error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.listen(Number(env.PORT), () => {
  consoleLogger.info(`Smart agent listening on http://localhost:${env.PORT}`);
});
