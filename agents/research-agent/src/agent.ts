import {
  ResearchInputSchema,
  ResearchOutputSchema,
  type ResearchInput,
  type ResearchOutput,
  type Finding,
  type Source,
} from "./schemas.js";
import type { ResearchProvider, SearchResult } from "./provider.js";
import { buildResearchPrompt } from "./prompts.js";

export class ResearchAgent {
  private readonly providers: ResearchProvider[];

  constructor(providers: ResearchProvider[]) {
    this.providers = providers;
  }

  async run(input: unknown): Promise<ResearchOutput> {
    const validated = ResearchInputSchema.parse(input);
    const _prompt = buildResearchPrompt(validated);

    const activeProviders = validated.providers
      ? this.providers.filter((p) => validated.providers!.includes(p.name))
      : this.providers;

    const allResults: SearchResult[] = [];

    for (const provider of activeProviders) {
      const results = await provider.search(validated.prompt, {
        language: validated.language,
        domains: validated.domains,
        maxResults: validated.maxSources,
      });
      allResults.push(...results);
    }

    const findings = this.aggregateResults(allResults);
    const sources = this.buildSources(allResults, validated.maxSources);
    const confidence = this.calculateConfidence(sources);

    const output: ResearchOutput = {
      summary: `Research results for: ${validated.prompt}`,
      findings,
      sources,
      confidence,
    };

    return ResearchOutputSchema.parse(output);
  }

  private aggregateResults(results: SearchResult[]): Finding[] {
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const result of results) {
      const key = result.url;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        title: result.title,
        detail: result.snippet,
        relevance: result.confidence,
      });
    }

    return findings.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  }

  private buildSources(
    results: SearchResult[],
    maxSources: number,
  ): Source[] {
    const uniqueByUrl = new Map<string, SearchResult>();
    for (const r of results) {
      const existing = uniqueByUrl.get(r.url);
      if (!existing || existing.confidence < r.confidence) {
        uniqueByUrl.set(r.url, r);
      }
    }

    return Array.from(uniqueByUrl.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSources)
      .map((r) => ({
        provider: r.provider,
        url: r.url,
        title: r.title,
        confidence: r.confidence,
      }));
  }

  private calculateConfidence(sources: Source[]): number {
    if (sources.length === 0) return 0;

    const totalWeight = sources.reduce((sum, s) => sum + s.confidence, 0);
    return Math.round((totalWeight / sources.length) * 100) / 100;
  }
}
