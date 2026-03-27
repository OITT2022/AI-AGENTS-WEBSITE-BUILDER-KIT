import { z } from "zod";

export const ContentInputSchema = z.object({
  type: z.enum(["article", "landing-copy", "seo-snippet", "social-snippet"]),
  topic: z.string(),
  language: z.enum(["he", "en", "ar"]),
  keywords: z.array(z.string()).optional(),
  tone: z.string().optional().default("professional"),
  maxWords: z.number().optional(),
});

export type ContentInput = z.infer<typeof ContentInputSchema>;

export const ContentMetadataSchema = z.object({
  readability: z.string(),
  keywords: z.array(z.string()),
});

export type ContentMetadata = z.infer<typeof ContentMetadataSchema>;

export const ContentOutputSchema = z.object({
  content: z.string(),
  language: z.string(),
  wordCount: z.number(),
  type: z.string(),
  seoScore: z.number().optional(),
  metadata: ContentMetadataSchema.optional(),
});

export type ContentOutput = z.infer<typeof ContentOutputSchema>;
