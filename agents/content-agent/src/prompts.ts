import type { ContentInput } from "./schemas.js";

const ARTICLE_TEMPLATE = `Write a well-structured article on the following topic.
Include an introduction, main body with clear sections, and a conclusion.`;

const LANDING_COPY_TEMPLATE = `Write compelling landing page copy for the following topic.
Include a headline, subheadline, key benefits, and a call to action.`;

const SEO_SNIPPET_TEMPLATE = `Write an SEO-optimized snippet for the following topic.
Include a meta title (max 60 chars), meta description (max 160 chars), and key phrases.`;

const SOCIAL_SNIPPET_TEMPLATE = `Write a social media post for the following topic.
Keep it engaging, concise, and include relevant hashtags.`;

const TEMPLATES: Record<string, string> = {
  article: ARTICLE_TEMPLATE,
  "landing-copy": LANDING_COPY_TEMPLATE,
  "seo-snippet": SEO_SNIPPET_TEMPLATE,
  "social-snippet": SOCIAL_SNIPPET_TEMPLATE,
};

export function buildContentPrompt(input: ContentInput): string {
  const template = TEMPLATES[input.type] ?? ARTICLE_TEMPLATE;

  const keywordsSection = input.keywords?.length
    ? `\nKeywords to incorporate: ${input.keywords.join(", ")}`
    : "";

  const wordLimit = input.maxWords
    ? `\nMaximum word count: ${input.maxWords}`
    : "";

  return `${template}

Topic: ${input.topic}
Language: ${input.language}
Tone: ${input.tone ?? "professional"}${keywordsSection}${wordLimit}`;
}

export { ARTICLE_TEMPLATE, LANDING_COPY_TEMPLATE, SEO_SNIPPET_TEMPLATE, SOCIAL_SNIPPET_TEMPLATE };
