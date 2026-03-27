import type { QaInput } from "./schemas.js";

export const QA_SYSTEM_PROMPT = `You are a QA agent specialized in testing web applications.
Your job is to thoroughly check websites for broken links, form issues, SEO problems,
accessibility violations, missing content, and broken assets.
Report all findings with severity levels and actionable suggestions.`;

export function buildQaPrompt(input: QaInput): string {
  const checksSection = `Checks to perform: ${input.checks.join(", ")}`;
  const thresholdSection = `Pass threshold: ${(input.threshold ?? 0.8) * 100}%`;

  return `${QA_SYSTEM_PROMPT}

Target URL: ${input.targetUrl}
${checksSection}
${thresholdSection}

Crawl the target URL and perform all requested checks. Report issues with severity levels.`;
}
