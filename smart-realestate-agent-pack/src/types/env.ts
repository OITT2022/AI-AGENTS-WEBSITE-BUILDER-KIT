import { z } from "zod";

export const envSchema = z.object({
  PORT: z.string().default("4020"),
  LOG_LEVEL: z.string().default("info"),
  PROPERTY_API_BASE_URL: z.string().url(),
  PROPERTY_API_KEY: z.string().min(1),
  EXISTING_PUBLISHER_WEBHOOK: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-5"),
  CANVA_API_BASE_URL: z.string().url(),
  CANVA_ACCESS_TOKEN: z.string().min(1),
  CANVA_BRAND_TEMPLATE_ID: z.string().min(1),
  CANVA_ASSET_FOLDER: z.string().default("real-estate-generated"),
  NANO_BANANA_API_BASE_URL: z.string().url(),
  NANO_BANANA_API_KEY: z.string().min(1),
  SHOTSTACK_API_BASE_URL: z.string().url(),
  SHOTSTACK_API_KEY: z.string().min(1),
  SHOTSTACK_OWNER_ID: z.string().optional(),
  OUTPUT_DIR: z.string().default("./output"),
  PUBLIC_ASSET_BASE_URL: z.string().url()
});

export type AppEnv = z.infer<typeof envSchema>;
