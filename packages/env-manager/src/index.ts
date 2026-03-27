import { z } from "zod";

export const envSchema = z.object({
  // Core
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  // Auth / session
  JWT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),

  // LLM providers
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Research providers
  PERPLEXITY_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),

  // Media providers
  NANO_BANANA_API_KEY: z.string().optional(),
  IMAGE_PROVIDER_API_KEY: z.string().optional(),
  VIDEO_PROVIDER_API_KEY: z.string().optional(),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_DEFAULT_BRANCH: z.string().optional(),

  // Vercel
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),

  // S3 / object storage
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Load and validate environment from a raw key-value object (defaults to process.env).
 */
export function loadEnv(
  input: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): EnvConfig {
  return envSchema.parse(input);
}

/**
 * Convenience alias: load env vars from process.env.
 */
export function getEnv(): EnvConfig {
  return loadEnv();
}

/**
 * Require a specific environment variable. Throws if it is missing or empty.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Required environment variable "${key}" is not set.`);
  }
  return value;
}
