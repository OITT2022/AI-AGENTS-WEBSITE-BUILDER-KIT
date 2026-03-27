import type { MediaProvider, MediaResult, MediaGenerationOptions } from "./provider.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SVG-based image provider that generates real usable SVG assets.
 * Used when no external API key is available.
 */
export class SvgImageProvider implements MediaProvider {
  name = "svg-generator";
  type = "image" as const;
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    mkdirSync(outputDir, { recursive: true });
  }

  async generate(prompt: string, options?: MediaGenerationOptions): Promise<MediaResult> {
    const w = options?.dimensions?.width ?? 1200;
    const h = options?.dimensions?.height ?? 630;
    const style = options?.style ?? "modern";

    // Extract the short description from the expanded prompt template
    const descMatch = prompt.match(/Description:\s*(.+)/);
    const shortPrompt = descMatch ? descMatch[1].trim() : prompt;

    const svg = this.buildSvg(shortPrompt, w, h, style);
    const filename = `${slugify(shortPrompt)}.svg`;
    const filepath = join(this.outputDir, filename);

    writeFileSync(filepath, svg, "utf-8");

    return {
      url: `/${filename}`,
      format: "svg",
      dimensions: { width: w, height: h },
      metadata: { prompt, style, generator: "svg-provider" },
    };
  }

  private buildSvg(prompt: string, w: number, h: number, style: string): string {
    const palette = getPalette(style);
    const seed = hashCode(prompt);
    const shapes = generateShapes(seed, w, h, palette);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${palette.bg1}"/>
      <stop offset="100%" style="stop-color:${palette.bg2}"/>
    </linearGradient>
    <filter id="blur1"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
${shapes}
</svg>`;
  }
}

interface Palette {
  bg1: string;
  bg2: string;
  accent1: string;
  accent2: string;
  accent3: string;
}

function getPalette(style: string): Palette {
  const palettes: Record<string, Palette> = {
    modern: { bg1: "#0f172a", bg2: "#1e1b4b", accent1: "#6366f1", accent2: "#06b6d4", accent3: "#8b5cf6" },
    warm: { bg1: "#1c1917", bg2: "#292524", accent1: "#f59e0b", accent2: "#ef4444", accent3: "#ec4899" },
    cool: { bg1: "#0c4a6e", bg2: "#164e63", accent1: "#22d3ee", accent2: "#38bdf8", accent3: "#a78bfa" },
    nature: { bg1: "#14532d", bg2: "#1a2e05", accent1: "#10b981", accent2: "#84cc16", accent3: "#22d3ee" },
    corporate: { bg1: "#1e293b", bg2: "#0f172a", accent1: "#3b82f6", accent2: "#6366f1", accent3: "#8b5cf6" },
    creative: { bg1: "#2e1065", bg2: "#4a044e", accent1: "#c084fc", accent2: "#f472b6", accent3: "#fb923c" },
  };
  return palettes[style] ?? palettes.modern;
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function generateShapes(seed: number, w: number, h: number, p: Palette): string {
  const lines: string[] = [];
  const rng = mulberry32(seed);

  // Large blurred orbs
  for (let i = 0; i < 3; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = 100 + rng() * 200;
    const color = [p.accent1, p.accent2, p.accent3][i % 3];
    const opacity = 0.15 + rng() * 0.15;
    lines.push(`  <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="${opacity.toFixed(2)}" filter="url(#blur1)"/>`);
  }

  // Medium shapes
  for (let i = 0; i < 5; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = 40 + rng() * 80;
    const color = [p.accent1, p.accent2, p.accent3][i % 3];
    const opacity = 0.08 + rng() * 0.12;
    lines.push(`  <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="${opacity.toFixed(2)}" filter="url(#blur2)"/>`);
  }

  // Grid pattern overlay
  lines.push(`  <g opacity="0.03" stroke="#fff" stroke-width="1">`);
  for (let x = 0; x < w; x += 60) {
    lines.push(`    <line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`);
  }
  for (let y = 0; y < h; y += 60) {
    lines.push(`    <line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`);
  }
  lines.push(`  </g>`);

  // Small accent dots
  for (let i = 0; i < 12; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = 2 + rng() * 4;
    const color = [p.accent1, p.accent2, p.accent3][i % 3];
    const opacity = 0.3 + rng() * 0.4;
    lines.push(`  <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`);
  }

  return lines.join("\n");
}

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
