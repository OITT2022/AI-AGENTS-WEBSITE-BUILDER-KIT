import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  VERCEL_TOKEN: z.string().optional()
});

export function loadEnv(input: Record<string, string | undefined>) {
  return envSchema.parse(input);
}
