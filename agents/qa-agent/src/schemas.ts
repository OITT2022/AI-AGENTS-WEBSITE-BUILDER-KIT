import { z } from "zod";

export const QaCheckEnum = z.enum([
  "links",
  "forms",
  "seo",
  "accessibility",
  "content",
  "assets",
]);

export type QaCheck = z.infer<typeof QaCheckEnum>;

export const QaInputSchema = z.object({
  targetUrl: z.string().url(),
  checks: z
    .array(QaCheckEnum)
    .default(["links", "forms", "seo", "accessibility"]),
  threshold: z.number().optional().default(0.8),
});

export type QaInput = z.infer<typeof QaInputSchema>;

export const IssueSeverityEnum = z.enum(["error", "warning", "info"]);

export type IssueSeverity = z.infer<typeof IssueSeverityEnum>;

export const IssueSchema = z.object({
  message: z.string(),
  severity: IssueSeverityEnum,
  element: z.string().optional(),
  suggestion: z.string().optional(),
});

export type Issue = z.infer<typeof IssueSchema>;

export const CheckResultSchema = z.object({
  check: z.string(),
  passed: z.boolean(),
  score: z.number(),
  issues: z.array(IssueSchema),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

export const QaOutputSchema = z.object({
  targetUrl: z.string(),
  passed: z.boolean(),
  score: z.number(),
  results: z.array(CheckResultSchema),
  reportPath: z.string().optional(),
});

export type QaOutput = z.infer<typeof QaOutputSchema>;
