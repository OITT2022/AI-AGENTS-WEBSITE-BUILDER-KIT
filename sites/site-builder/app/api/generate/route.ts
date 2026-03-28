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

  // Build {{IMG_X}} placeholders — actual data URLs are injected client-side
  let imgIndex = 0;

  const mediaDescriptions: string[] = [];
  if (mediaData?.length) {
    for (const m of mediaData as Array<{ type?: string; prompt?: string; imageUrl?: string }>) {
      if (m.imageUrl) {
        imgIndex++;
        mediaDescriptions.push(`- ${m.type ?? "image"}: "${m.prompt}" → use src="{{IMG_${imgIndex}}}"`);
      } else {
        mediaDescriptions.push(`- ${m.type ?? "image"}: "${m.prompt}" → use CSS gradient placeholder`);
      }
    }
  }

  const driveDescriptions: string[] = [];
  if (driveFiles?.length) {
    for (const f of driveFiles as Array<{ name: string; mimeType: string; dataUrl?: string }>) {
      if (f.dataUrl && f.mimeType.startsWith("image/")) {
        imgIndex++;
        driveDescriptions.push(`- ${f.name} → use src="{{IMG_${imgIndex}}}" (logo/image from Google Drive)`);
      } else {
        driveDescriptions.push(`- ${f.name} (${f.mimeType})`);
      }
    }
  }

  const prompt = `You are a professional web developer. Generate a complete, single-file HTML website.

## Site Description
${siteDescription || "Infer from the scraped content and research below."}

## Scraped Website Data
${scrapeData?.title ? `Source: ${scrapeData.title}` : "No site scraped."}
${scrapeData?.description ? `Description: ${scrapeData.description}` : ""}
${scrapeData?.markdown ? `Content:\n${scrapeData.markdown.slice(0, 2500)}` : ""}

## Research Data
${researchData?.answer ? `Summary: ${researchData.answer}` : "No research."}
${researchData?.results?.length ? `Sources:\n${(researchData.results as Array<{ title: string; content: string }>).slice(0, 3).map((r) => `- ${r.title}: ${r.content?.slice(0, 120)}`).join("\n")}` : ""}

## Images
${mediaDescriptions.length ? mediaDescriptions.join("\n") : mediaPrompt ? `Create CSS gradient placeholders for:\n${mediaPrompt}` : "Use CSS gradients for visuals."}

## Google Drive Files
${driveDescriptions.length ? driveDescriptions.join("\n") : "None."}

## Instructions
- Complete standalone HTML with embedded CSS and JS
- Modern professional design, dark theme, responsive
- Hebrew RTL if content is Hebrew, otherwise English
- Use the {{IMG_X}} placeholders exactly as shown for image src attributes
- Use CSS Grid/Flexbox, clean typography, hover effects
- No external dependencies or CDN links
- Output ONLY HTML code, no markdown fences`;

  try {
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
      return Response.json({ error: `Anthropic ${response.status}: ${errorText.slice(0, 300)}` }, { status: 500 });
    }

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
        } catch { /* skip */ }
      }
    }

    let html = fullText
      .replace(/^```html?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    // {{IMG_X}} placeholders are replaced client-side with actual data URLs
    return Response.json({ success: true, html });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
