import {
  QaInputSchema,
  QaOutputSchema,
  type QaInput,
  type QaOutput,
  type CheckResult,
  type Issue,
} from "./schemas.js";
import type { CrawlProvider, PageResult } from "./provider.js";
import { buildQaPrompt } from "./prompts.js";

export class QaAgent {
  private readonly crawler: CrawlProvider | null;

  constructor(crawler?: CrawlProvider) {
    this.crawler = crawler ?? null;
  }

  async run(input: unknown): Promise<QaOutput> {
    const validated = QaInputSchema.parse(input);
    const _prompt = buildQaPrompt(validated);

    let pages: PageResult[] = [];
    if (this.crawler) {
      const crawlResult = await this.crawler.crawl(validated.targetUrl, {
        maxPages: 50,
        depth: 3,
      });
      pages = crawlResult.pages;
    }

    const results: CheckResult[] = [];

    for (const check of validated.checks) {
      switch (check) {
        case "links":
          results.push(this.runLinkCheck(pages));
          break;
        case "forms":
          results.push(this.runFormCheck(pages));
          break;
        case "seo":
          results.push(this.runSeoCheck(pages));
          break;
        case "accessibility":
          results.push(this.runAccessibilityCheck(pages));
          break;
        case "content":
          results.push(this.runContentCheck(pages));
          break;
        case "assets":
          results.push(this.runAssetCheck(pages));
          break;
      }
    }

    const report = this.generateReport(
      validated.targetUrl,
      results,
      validated.threshold,
    );

    return QaOutputSchema.parse(report);
  }

  private runLinkCheck(pages: PageResult[]): CheckResult {
    const issues: Issue[] = [];

    for (const page of pages) {
      for (const link of page.links) {
        if (!link.href || link.href === "#") {
          issues.push({
            message: `Empty or placeholder link found on ${page.url}`,
            severity: "warning",
            element: `<a href="${link.href}">${link.text}</a>`,
            suggestion: "Add a valid href attribute to the link",
          });
        }
      }

      if (page.status >= 400) {
        issues.push({
          message: `Page returned status ${page.status}: ${page.url}`,
          severity: "error",
          suggestion: "Fix the broken page or update links pointing to it",
        });
      }
    }

    const score = pages.length > 0
      ? Math.max(0, 1 - issues.filter((i) => i.severity === "error").length / Math.max(pages.length, 1))
      : 1;

    return {
      check: "links",
      passed: score >= 0.8,
      score: Math.round(score * 100) / 100,
      issues,
    };
  }

  private runFormCheck(pages: PageResult[]): CheckResult {
    const issues: Issue[] = [];

    for (const page of pages) {
      for (const form of page.forms) {
        if (!form.action) {
          issues.push({
            message: `Form without action attribute on ${page.url}`,
            severity: "warning",
            suggestion: "Add an action attribute to the form",
          });
        }

        if (form.fields.length === 0) {
          issues.push({
            message: `Empty form found on ${page.url}`,
            severity: "error",
            suggestion: "Add input fields to the form",
          });
        }
      }
    }

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const totalForms = pages.reduce((sum, p) => sum + p.forms.length, 0);
    const score = totalForms > 0 ? Math.max(0, 1 - errorCount / totalForms) : 1;

    return {
      check: "forms",
      passed: score >= 0.8,
      score: Math.round(score * 100) / 100,
      issues,
    };
  }

  private runSeoCheck(pages: PageResult[]): CheckResult {
    const issues: Issue[] = [];

    for (const page of pages) {
      if (!page.title) {
        issues.push({
          message: `Missing title tag on ${page.url}`,
          severity: "error",
          suggestion: "Add a descriptive <title> tag",
        });
      }

      const hasDescription = page.meta.some(
        (m) => m.name === "description" && m.content.length > 0,
      );
      if (!hasDescription) {
        issues.push({
          message: `Missing meta description on ${page.url}`,
          severity: "warning",
          suggestion: "Add a meta description tag (max 160 characters)",
        });
      }
    }

    const errorCount = issues.filter((i) => i.severity === "error").length;
    const score = pages.length > 0 ? Math.max(0, 1 - errorCount / pages.length) : 1;

    return {
      check: "seo",
      passed: score >= 0.8,
      score: Math.round(score * 100) / 100,
      issues,
    };
  }

  private runAccessibilityCheck(pages: PageResult[]): CheckResult {
    const issues: Issue[] = [];

    for (const page of pages) {
      for (const img of page.images) {
        if (!img.alt) {
          issues.push({
            message: `Image missing alt text on ${page.url}`,
            severity: "error",
            element: `<img src="${img.src}" />`,
            suggestion: "Add descriptive alt text to the image",
          });
        }
      }
    }

    const totalImages = pages.reduce((sum, p) => sum + p.images.length, 0);
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const score = totalImages > 0 ? Math.max(0, 1 - errorCount / totalImages) : 1;

    return {
      check: "accessibility",
      passed: score >= 0.8,
      score: Math.round(score * 100) / 100,
      issues,
    };
  }

  private runContentCheck(pages: PageResult[]): CheckResult {
    const issues: Issue[] = [];

    for (const page of pages) {
      if (!page.title && page.links.length === 0 && page.images.length === 0) {
        issues.push({
          message: `Potentially empty page: ${page.url}`,
          severity: "warning",
          suggestion: "Add meaningful content to the page",
        });
      }
    }

    const warningCount = issues.length;
    const score = pages.length > 0 ? Math.max(0, 1 - warningCount / pages.length) : 1;

    return {
      check: "content",
      passed: score >= 0.8,
      score: Math.round(score * 100) / 100,
      issues,
    };
  }

  private runAssetCheck(pages: PageResult[]): CheckResult {
    const issues: Issue[] = [];

    for (const page of pages) {
      for (const img of page.images) {
        if (!img.src || img.src.trim() === "") {
          issues.push({
            message: `Image with empty src on ${page.url}`,
            severity: "error",
            element: "<img />",
            suggestion: "Provide a valid src attribute for the image",
          });
        }
      }
    }

    const totalAssets = pages.reduce((sum, p) => sum + p.images.length, 0);
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const score = totalAssets > 0 ? Math.max(0, 1 - errorCount / totalAssets) : 1;

    return {
      check: "assets",
      passed: score >= 0.8,
      score: Math.round(score * 100) / 100,
      issues,
    };
  }

  private generateReport(
    targetUrl: string,
    results: CheckResult[],
    threshold: number,
  ): QaOutput {
    const totalScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 1;

    const score = Math.round(totalScore * 100) / 100;

    return {
      targetUrl,
      passed: score >= threshold,
      score,
      results,
    };
  }
}
