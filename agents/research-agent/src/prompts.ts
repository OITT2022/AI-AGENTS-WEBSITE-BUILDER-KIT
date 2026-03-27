import type { ResearchInput } from "./schemas.js";

export const RESEARCH_SYSTEM_PROMPT = `You are a research agent specializing in gathering, synthesizing, and validating information from multiple sources.
Your goal is to provide comprehensive, accurate, and well-sourced research findings.
Always cite your sources and indicate confidence levels for each finding.
When working with Hebrew (he) or Arabic (ar) content, ensure proper RTL text handling.`;

export function buildResearchPrompt(input: ResearchInput): string {
  const domainConstraint = input.domains?.length
    ? `\nFocus on the following domains: ${input.domains.join(", ")}`
    : "";

  const providerConstraint = input.providers?.length
    ? `\nUse the following providers: ${input.providers.join(", ")}`
    : "";

  return `Research the following topic thoroughly.

Topic: ${input.prompt}
Language: ${input.language}
Maximum sources to include: ${input.maxSources}${domainConstraint}${providerConstraint}

Provide a structured summary with findings, sources, and confidence scores.`;
}
