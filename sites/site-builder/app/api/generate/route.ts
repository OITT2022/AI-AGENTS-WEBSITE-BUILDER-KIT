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

  // Build {{IMG_X}} placeholders
  let imgIndex = 0;
  const mediaDesc: string[] = [];
  if (mediaData?.length) {
    for (const m of mediaData as Array<{ type?: string; prompt?: string; imageUrl?: string }>) {
      if (m.imageUrl) { imgIndex++; mediaDesc.push(`- ${m.type ?? "image"}: "${m.prompt}" → src="{{IMG_${imgIndex}}}"`); }
      else { mediaDesc.push(`- ${m.type ?? "image"}: "${m.prompt}" → CSS gradient`); }
    }
  }
  const driveDesc: string[] = [];
  if (driveFiles?.length) {
    for (const f of driveFiles as Array<{ name: string; mimeType: string; dataUrl?: string }>) {
      if (f.dataUrl && f.mimeType.startsWith("image/")) { imgIndex++; driveDesc.push(`- ${f.name} → src="{{IMG_${imgIndex}}}"`); }
      else { driveDesc.push(`- ${f.name} (${f.mimeType})`); }
    }
  }

  const prompt = `You are a professional web developer. Generate a complete, single-file HTML website.

## Site Description
${siteDescription || "Infer from scraped content and research."}

## Scraped Data
${scrapeData?.title ? `Source: ${scrapeData.title}` : "None."}
${scrapeData?.description || ""}
${scrapeData?.markdown ? scrapeData.markdown.slice(0, 2000) : ""}

## Research
${researchData?.answer || "None."}
${researchData?.results?.length ? (researchData.results as Array<{ title: string; content: string }>).slice(0, 3).map((r) => `- ${r.title}: ${r.content?.slice(0, 100)}`).join("\n") : ""}

## Images
${mediaDesc.length ? mediaDesc.join("\n") : mediaPrompt || "Use CSS gradients."}

## Drive Files
${driveDesc.length ? driveDesc.join("\n") : "None."}

## Rules
- Complete standalone HTML with CSS and JS embedded
- Modern dark theme, responsive, RTL if Hebrew
- Use {{IMG_X}} placeholders exactly as shown for img src
- No external dependencies
- Output ONLY HTML`;

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
        max_tokens: 10000,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `Claude API ${response.status}: ${errText.slice(0, 200)}` }, { status: 500 });
    }

    // Stream Anthropic SSE directly to the browser to prevent timeout
    const encoder = new TextEncoder();
    const anthropicReader = response.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async pull(controller) {
        let buffer = "";

        while (true) {
          const { done, value } = await anthropicReader.read();
          if (done) {
            // Send end marker
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

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
                // Forward the text chunk to the browser
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
