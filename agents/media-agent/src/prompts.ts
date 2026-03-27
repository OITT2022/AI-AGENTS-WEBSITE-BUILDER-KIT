import type { MediaInput } from "./schemas.js";

export const IMAGE_PROMPT_TEMPLATE = `Generate a high-quality image based on the following description.
Ensure the image is visually appealing and matches the requested style.`;

export const CHART_PROMPT_TEMPLATE = `Generate a clear and informative chart or data visualization.
Use appropriate chart types, labels, and legends for the data described.`;

export const VIDEO_PROMPT_TEMPLATE = `Generate a short video based on the following description.
Ensure smooth transitions and clear visual storytelling.`;

const TEMPLATES: Record<string, string> = {
  image: IMAGE_PROMPT_TEMPLATE,
  chart: CHART_PROMPT_TEMPLATE,
  video: VIDEO_PROMPT_TEMPLATE,
};

export function buildMediaPrompt(input: MediaInput): string {
  const template = TEMPLATES[input.type] ?? IMAGE_PROMPT_TEMPLATE;

  const styleSection = input.style ? `\nStyle: ${input.style}` : "";

  const dimensionsSection = input.dimensions
    ? `\nDimensions: ${input.dimensions.width}x${input.dimensions.height}`
    : "";

  return `${template}

Description: ${input.prompt}
Format: ${input.format ?? "png"}${styleSection}${dimensionsSection}`;
}
