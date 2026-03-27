import { z } from "zod";

export const DimensionsSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export type Dimensions = z.infer<typeof DimensionsSchema>;

export const MediaInputSchema = z.object({
  type: z.enum(["image", "chart", "video"]),
  prompt: z.string(),
  style: z.string().optional(),
  dimensions: DimensionsSchema.optional(),
  format: z.string().optional().default("png"),
});

export type MediaInput = z.infer<typeof MediaInputSchema>;

export const MediaOutputSchema = z.object({
  url: z.string(),
  type: z.string(),
  provider: z.string(),
  format: z.string(),
  dimensions: DimensionsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MediaOutput = z.infer<typeof MediaOutputSchema>;
