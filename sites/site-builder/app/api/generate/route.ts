import { getSession } from "../../lib/auth";

export const runtime = "edge";

function classifyDriveFile(name: string, mimeType: string): string {
  const lower = name.toLowerCase();
  if (/logo/i.test(lower)) return "logo";
  if (/favicon|icon/i.test(lower)) return "icon";
  if (/banner|hero|cover|header/i.test(lower)) return "hero-banner";
  if (/bg|background|backdrop/i.test(lower)) return "background";
  if (/team|staff|about/i.test(lower)) return "team-photo";
  if (/product|service|portfolio|project|work/i.test(lower)) return "portfolio-image";
  if (/gallery/i.test(lower)) return "gallery-image";
  if (/testimonial|review|client/i.test(lower)) return "testimonial-image";
  if (mimeType.startsWith("image/")) return "content-image";
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return "document";
  if (mimeType.includes("presentation")) return "presentation";
  return "file";
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { scrapeData, researchData, mediaData, mediaPrompt, siteDescription, driveFiles } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Build {{IMG_X}} placeholders for generated media
  let imgIndex = 0;
  const mediaDesc: string[] = [];
  if (mediaData?.length) {
    for (const m of mediaData as Array<{ type?: string; prompt?: string; imageUrl?: string }>) {
      if (m.imageUrl) { imgIndex++; mediaDesc.push(`- Generated ${m.type ?? "image"}: "${m.prompt}" → use src="{{IMG_${imgIndex}}}"`); }
      else { mediaDesc.push(`- ${m.type ?? "image"}: "${m.prompt}" → use CSS gradient placeholder`); }
    }
  }

  // Build {{IMG_X}} placeholders for Drive files + classify their role
  const driveDesc: string[] = [];
  const driveImages: string[] = [];
  const driveDocs: string[] = [];

  if (driveFiles?.length) {
    for (const f of driveFiles as Array<{ name: string; mimeType: string; dataUrl?: string }>) {
      const role = classifyDriveFile(f.name, f.mimeType);

      if (f.dataUrl && f.mimeType.startsWith("image/")) {
        imgIndex++;
        const placeholder = `{{IMG_${imgIndex}}}`;
        driveImages.push(`- "${f.name}" [role: ${role}] → use src="${placeholder}"`);
        driveDesc.push(`Image: "${f.name}" classified as **${role}** → ${placeholder}`);
      } else {
        driveDocs.push(`- "${f.name}" (${f.mimeType}) [role: ${role}]`);
        driveDesc.push(`Document: "${f.name}" (${role})`);
      }
    }
  }

  const hasDriveContent = driveImages.length > 0 || driveDocs.length > 0;

  const prompt = `You are a professional web developer. Generate a complete, single-file HTML website.

## Site Description
${siteDescription || "Infer from scraped content, research, and uploaded files below."}

## Scraped Website Data
${scrapeData?.title ? `Source site: ${scrapeData.title}` : "No site scraped."}
${scrapeData?.description || ""}
${scrapeData?.markdown ? scrapeData.markdown.slice(0, 2000) : ""}

## Research Results
${researchData?.answer || "No research provided."}
${researchData?.results?.length ? (researchData.results as Array<{ title: string; content: string }>).slice(0, 3).map((r) => `- ${r.title}: ${r.content?.slice(0, 100)}`).join("\n") : ""}

## Generated Media (from Nano Banana / Imagen)
${mediaDesc.length ? mediaDesc.join("\n") : mediaPrompt ? `User requested: ${mediaPrompt}\nCreate CSS gradient placeholders for these.` : "No generated media. Use CSS gradients for visual elements."}

${hasDriveContent ? `## User's Files from Google Drive
The user uploaded the following files from their Google Drive. These are REAL brand assets — logos, photos, and documents that MUST be incorporated into the website.

### Images (use these as img src)
${driveImages.length ? driveImages.join("\n") : "None."}

### Documents (use content for text/information)
${driveDocs.length ? driveDocs.join("\n") : "None."}

### How to use the Drive files:
- **logo** → Place in the header/navbar AND footer. Make it prominent.
- **hero-banner** → Use as the hero section background image.
- **background** → Use as a section background with overlay for text readability.
- **team-photo** → Display in the About/Team section.
- **portfolio-image** → Display in the Portfolio/Projects/Work section.
- **gallery-image** → Display in a gallery grid.
- **testimonial-image** → Display next to testimonials/reviews.
- **content-image** → Use in relevant content sections.
- **icon** → Use as a favicon or section icon.
- **document/presentation** → Extract key information and include as text content.

IMPORTANT: Every uploaded image MUST appear in the final website. Do not skip any.` : "## User Files\nNo files uploaded from Google Drive."}

## Technical Requirements
- Complete standalone HTML file with all CSS and JS embedded
- Modern, professional dark theme design
- Fully responsive (mobile-first)
- Use Hebrew RTL layout if the content is in Hebrew, otherwise English LTR
- Use the {{IMG_X}} placeholders EXACTLY as shown above for all image src attributes
- Include smooth scroll, hover effects, subtle animations
- Use CSS Grid/Flexbox for layout
- Proper meta tags (title, description, viewport)
- Clean typography with good spacing
- No external dependencies or CDN links
- Output ONLY the HTML code — no markdown fences, no explanation`;

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

    const encoder = new TextEncoder();
    const anthropicReader = response.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async pull(controller) {
        let buffer = "";
        while (true) {
          const { done, value } = await anthropicReader.read();
          if (done) {
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
