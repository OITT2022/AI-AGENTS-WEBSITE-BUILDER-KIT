import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "../../lib/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { scrapeData, researchData, mediaData, mediaPrompt, siteDescription } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
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
    // Use streaming to avoid Vercel timeout on Hobby plan
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";

        try {
          const streamResponse = client.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 16000,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const event of streamResponse) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullText += event.delta.text;
              // Send a keep-alive chunk (space) to prevent timeout
              controller.enqueue(encoder.encode(" "));
            }
          }

          // Clean up markdown fences if present
          const cleanHtml = fullText
            .replace(/^```html?\s*\n?/i, "")
            .replace(/\n?```\s*$/i, "")
            .trim();

          // Send the final JSON result
          const result = JSON.stringify({
            success: true,
            html: cleanHtml,
            savedPath: "",
          });

          controller.enqueue(encoder.encode("\n" + result));
          controller.close();
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errResult = JSON.stringify({ error: errMsg });
          controller.enqueue(encoder.encode("\n" + errResult));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
