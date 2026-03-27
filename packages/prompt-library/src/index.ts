// ── Types ──

export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
}

// ── Renderer ──

export function renderPrompt(template: PromptTemplate, vars: Record<string, string>): string {
  let result = template.template;
  for (const variable of template.variables) {
    const value = vars[variable] ?? "";
    result = result.replaceAll(`{{${variable}}}`, value);
  }
  return result;
}

// ── Predefined prompt templates ──

export const RESEARCH_PROMPT: PromptTemplate = {
  name: "research",
  template:
    "Research the following topic: {{topic}}. Language: {{language}}. Focus on: {{focus}}. Max sources: {{maxSources}}.",
  variables: ["topic", "language", "focus", "maxSources"],
};

export const CONTENT_PROMPT: PromptTemplate = {
  name: "content",
  template:
    "Generate {{contentType}} content about: {{topic}}. Language: {{language}}. Tone: {{tone}}. Keywords: {{keywords}}.",
  variables: ["contentType", "topic", "language", "tone", "keywords"],
};

export const SITE_PROMPT: PromptTemplate = {
  name: "site",
  template:
    "Generate a website project based on this brief: {{brief}}. Framework: {{framework}}. Database: {{database}}.",
  variables: ["brief", "framework", "database"],
};

export const MEDIA_PROMPT: PromptTemplate = {
  name: "media",
  template:
    "Generate {{mediaType}} with the following description: {{prompt}}. Style: {{style}}.",
  variables: ["mediaType", "prompt", "style"],
};

export const QA_PROMPT: PromptTemplate = {
  name: "qa",
  template: "Run QA checks on {{targetUrl}}. Checks to perform: {{checks}}.",
  variables: ["targetUrl", "checks"],
};

// ── Registry ──

export const promptRegistry: Map<string, PromptTemplate> = new Map([
  [RESEARCH_PROMPT.name, RESEARCH_PROMPT],
  [CONTENT_PROMPT.name, CONTENT_PROMPT],
  [SITE_PROMPT.name, SITE_PROMPT],
  [MEDIA_PROMPT.name, MEDIA_PROMPT],
  [QA_PROMPT.name, QA_PROMPT],
]);
