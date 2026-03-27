import { z } from "zod";

export const SiteAssetSchema = z.object({
  type: z.string(),
  url: z.string(),
});

export type SiteAsset = z.infer<typeof SiteAssetSchema>;

export const SiteInputSchema = z.object({
  brief: z.string(),
  language: z.enum(["he", "en", "ar"]),
  framework: z.enum(["nextjs", "astro", "html"]).default("nextjs"),
  database: z.enum(["postgresql", "sqlite", "none"]).default("postgresql"),
  features: z.array(z.string()).optional(),
  assets: z.array(SiteAssetSchema).optional(),
});

export type SiteInput = z.infer<typeof SiteInputSchema>;

export const SiteArtifactSchema = z.object({
  type: z.string(),
  path: z.string(),
});

export type SiteArtifact = z.infer<typeof SiteArtifactSchema>;

export const SiteOutputSchema = z.object({
  projectName: z.string(),
  pages: z.array(z.string()),
  hasAdmin: z.boolean(),
  hasAuth: z.boolean(),
  database: z.string(),
  repoUrl: z.string().optional(),
  deployUrl: z.string().optional(),
  artifacts: z.array(SiteArtifactSchema),
});

export type SiteOutput = z.infer<typeof SiteOutputSchema>;
