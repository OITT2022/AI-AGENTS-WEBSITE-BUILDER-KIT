import {
  ContentInputSchema,
  ContentOutputSchema,
  type ContentInput,
  type ContentOutput,
} from "./schemas.js";
import type { ContentProvider } from "./provider.js";
import { buildContentPrompt } from "./prompts.js";

export class ContentAgent {
  private readonly provider: ContentProvider | null;

  constructor(provider?: ContentProvider) {
    this.provider = provider ?? null;
  }

  async run(input: unknown): Promise<ContentOutput> {
    const validated = ContentInputSchema.parse(input);
    const prompt = buildContentPrompt(validated);

    let contentText: string;

    if (this.provider) {
      const generated = await this.provider.generate(prompt, {
        type: validated.type,
        tone: validated.tone,
        maxWords: validated.maxWords,
        keywords: validated.keywords,
        language: validated.language,
      });
      contentText = generated.text;
    } else {
      contentText = `[Generated ${validated.type} content for: ${validated.topic}]`;
    }

    contentText = this.reviewContent(contentText, validated.language);

    const wordCount = contentText.split(/\s+/).filter(Boolean).length;
    const seoScore = validated.keywords?.length
      ? this.calculateSeoScore(contentText, validated.keywords)
      : undefined;

    const output: ContentOutput = {
      content: contentText,
      language: validated.language,
      wordCount,
      type: validated.type,
      seoScore,
      metadata: validated.keywords?.length
        ? {
            readability: this.assessReadability(wordCount),
            keywords: validated.keywords,
          }
        : undefined,
    };

    return ContentOutputSchema.parse(output);
  }

  private reviewContent(content: string, language: string): string {
    if (language === "he" || language === "ar") {
      // Ensure RTL markers are present for RTL languages
      if (!content.startsWith("\u200F")) {
        return `\u200F${content}`;
      }
    }
    return content;
  }

  private calculateSeoScore(content: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const lowerContent = content.toLowerCase();
    let found = 0;

    for (const keyword of keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        found++;
      }
    }

    return Math.round((found / keywords.length) * 100) / 100;
  }

  private assessReadability(wordCount: number): string {
    if (wordCount < 100) return "short";
    if (wordCount < 300) return "medium";
    if (wordCount < 800) return "long";
    return "very-long";
  }
}
