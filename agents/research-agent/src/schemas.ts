import { z } from "zod";

export const ResearchInputSchema = z.object({
  prompt: z.string(),
  language: z.enum(["he", "en", "ar"]),
  providers: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  maxSources: z.number().default(10),
});

export type ResearchInput = z.infer<typeof ResearchInputSchema>;

export const FindingSchema = z.object({
  title: z.string(),
  detail: z.string(),
  relevance: z.number().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const SourceSchema = z.object({
  provider: z.string(),
  url: z.string(),
  title: z.string().optional(),
  confidence: z.number(),
});

export type Source = z.infer<typeof SourceSchema>;

export const ResearchOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema),
  sources: z.array(SourceSchema),
  confidence: z.number(),
});

export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
