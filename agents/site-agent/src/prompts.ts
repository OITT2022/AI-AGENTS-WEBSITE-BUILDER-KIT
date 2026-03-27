import type { SiteInput } from "./schemas.js";

export const SITE_GENERATION_PROMPT = `You are a site generation agent that creates full web application project structures.
Given a brief, generate a complete project with pages, components, configuration files, and database schemas.
Follow best practices for the chosen framework and ensure proper i18n support for the target language.`;

export function buildSitePrompt(input: SiteInput): string {
  const featuresSection = input.features?.length
    ? `\nRequired features: ${input.features.join(", ")}`
    : "";

  const assetsSection = input.assets?.length
    ? `\nProvided assets:\n${input.assets.map((a) => `  - ${a.type}: ${a.url}`).join("\n")}`
    : "";

  return `${SITE_GENERATION_PROMPT}

Project Brief: ${input.brief}
Language: ${input.language}
Framework: ${input.framework}
Database: ${input.database}${featuresSection}${assetsSection}

Generate the complete project structure including all necessary files and configurations.`;
}
