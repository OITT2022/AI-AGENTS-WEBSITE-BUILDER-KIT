import { getSession } from "../../lib/auth";

export const runtime = "edge";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { scrapeData, researchData, mediaData, mediaPrompt, siteDescription, driveFiles } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const prompt = `You are a professional web developer. Generate a complete, single-file HTML website based on the following data.

## Site Description
${siteDescription ? siteDescription : "No specific description provided — infer from the scraped content and research."}

## Scraped Website Data
${scrapeData?.title ? `**Source Site:** ${scrapeData.title}` : "No site scraped."}
${scrapeData?.description ? `**Description:** ${scrapeData.description}` : ""}
${scrapeData?.markdown ? `**Content:**\n${scrapeData.markdown.slice(0, 3000)}` : ""}

## Research Data
${researchData?.answer ? `**Research Summary:** ${researchData.answer}` : "No research provided."}
${
  researchData?.results?.length
    ? `**Sources:**\n${researchData.results
        .slice(0, 4)
        .map((r: { title: string; content: string }) => `- ${r.title}: ${r.content?.slice(0, 150)}`)
        .join("\n")}`
    : ""
}

## Media & Images
${
  mediaData?.length
    ? `Generated images:\n${mediaData
        .map(
          (m: Record<string, unknown>) =>
            `- ${m.type ?? "image"}: "${m.prompt}" → ${m.imageUrl ? "use this data URL as src" : "use CSS gradient"}`
        )
        .join("\n")}\n\nUse these as img src. For failed ones, use CSS gradient placeholders.`
    : mediaPrompt
      ? `Create CSS gradient/SVG placeholders for:\n${mediaPrompt}`
      : "Use CSS gradients for visuals."
}

## Files from Google Drive
${
  driveFiles?.length
    ? `The user uploaded these files from Google Drive:\n${driveFiles
        .map((f: { name: string; mimeType: string; dataUrl?: string }) =>
          `- ${f.name} (${f.mimeType})${f.dataUrl ? " → use this data URL as img src" : ""}`)
        .join("\n")}\n\nUse the data URLs directly as image src attributes where appropriate (logos, backgrounds, etc).`
    : "No files uploaded from Google Drive."
}

## Instructions
- Create a COMPLETE standalone HTML file with embedded CSS and JS
- Modern professional design, dark theme, fully responsive
- Hebrew RTL if content is Hebrew, otherwise English
- Proper meta tags, clean typography, hover effects
- CSS Grid/Flexbox layout
- No external dependencies
- Output ONLY HTML — no markdown fences, no explanation`;

  try {
    // Call Anthropic API directly with streaming via fetch (Edge-compatible)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 12000,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: `Anthropic ${response.status}: ${errorText.slice(0, 200)}` }, { status: 500 });
    }

    // Parse SSE stream, collect text, then return final JSON
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            fullText += parsed.delta.text;
          }
        } catch {
          // skip unparseable lines
        }
      }
    }

    const cleanHtml = fullText
      .replace(/^```html?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    return Response.json({ success: true, html: cleanHtml });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
