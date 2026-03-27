import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSession } from "../../lib/auth";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scrapeData, researchData, mediaData, mediaPrompt, siteDescription, siteName } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are a professional web developer. Generate a complete, single-file HTML website based on the following data.

## Site Description
${siteDescription ? siteDescription : "No specific description provided — infer from the scraped content and research."}

## Scraped Website Data
${scrapeData?.title ? `**Source Site:** ${scrapeData.title}` : "No site scraped."}
${scrapeData?.description ? `**Description:** ${scrapeData.description}` : ""}
${scrapeData?.markdown ? `**Content:**\n${scrapeData.markdown.slice(0, 4000)}` : ""}

## Research Data
${researchData?.answer ? `**Research Summary:** ${researchData.answer}` : "No research provided."}
${
  researchData?.results?.length
    ? `**Sources:**\n${researchData.results
        .slice(0, 5)
        .map((r: { title: string; content: string }) => `- ${r.title}: ${r.content?.slice(0, 200)}`)
        .join("\n")}`
    : ""
}

## Media & Images
${
  mediaData?.length
    ? `The following images were generated via Nano Banana:\n${mediaData
        .map(
          (m: Record<string, unknown>) =>
            `- ${m.type ?? "image"}: "${m.prompt}" → ${m.imageUrl ?? "(generation failed — use CSS gradient placeholder)"}`
        )
        .join("\n")}\n\nUse these image URLs as src attributes. For any that failed, create beautiful CSS gradient placeholders.`
    : mediaPrompt
      ? `The user requested these media assets (generate CSS gradient/SVG placeholders for them):\n${mediaPrompt}`
      : "No specific media requested — use CSS gradients and shapes for visual elements."
}

## Instructions
- Create a COMPLETE, standalone HTML file with embedded CSS and minimal JS
- Use modern, professional design with a dark theme
- Make it fully responsive (mobile-friendly)
- Use Hebrew (RTL) as the primary language if the content is in Hebrew, otherwise use English
- Include proper meta tags, title, and description
- Use clean typography and spacing
- Add smooth scroll and subtle hover effects
- Include all sections relevant to the content (hero, features, about, contact, etc.)
- Use CSS Grid/Flexbox for layout
- The HTML must be complete and ready to open in a browser
- Do NOT use any external dependencies or CDN links
- Output ONLY the HTML code, nothing else — no markdown fences, no explanation`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });

    const htmlContent =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Clean up — remove markdown fences if accidentally included
    const cleanHtml = htmlContent
      .replace(/^```html?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    // Save to sites/ folder if siteName is provided (local dev only — skipped on Vercel)
    let savedPath = "";
    if (siteName) {
      const slug = siteName
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .trim();

      try {
        const sitesDir = join(process.cwd(), "..", slug);
        mkdirSync(sitesDir, { recursive: true });
        writeFileSync(join(sitesDir, "index.html"), cleanHtml, "utf-8");
        savedPath = `sites/${slug}/index.html`;
      } catch {
        // Read-only filesystem (e.g. Vercel) — skip file save
        savedPath = "";
      }
    }

    return NextResponse.json({
      success: true,
      html: cleanHtml,
      savedPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
