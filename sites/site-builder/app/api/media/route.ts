import { NextResponse } from "next/server";
import { getSession } from "../../lib/auth";

export const maxDuration = 30;

interface MediaRequest {
  prompt: string;
  type?: "image" | "banner" | "icon" | "background";
  width?: number;
  height?: number;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: MediaRequest = await req.json();
  const { prompt, type = "image", width = 1024, height = 1024 } = body;

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Pick aspect ratio from dimensions
  let aspectRatio = "1:1";
  if (width > height * 1.3) aspectRatio = "16:9";
  else if (height > width * 1.3) aspectRatio = "9:16";
  else if (width > height) aspectRatio = "4:3";
  else if (height > width) aspectRatio = "3:4";

  const enhancedPrompt = `Professional ${type} image: ${prompt}. High quality, modern design, clean composition.`;

  try {
    // Google Imagen 4 Fast API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: enhancedPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Imagen 4: ${response.status} — ${errorText.slice(0, 300)}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const prediction = data.predictions?.[0];

    if (prediction?.bytesBase64Encoded) {
      const mimeType = prediction.mimeType ?? "image/png";
      const dataUrl = `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;

      return NextResponse.json({
        success: true,
        imageUrl: dataUrl,
        prompt,
        type,
        dimensions: { width, height },
        provider: "imagen-4-fast",
      });
    }

    return NextResponse.json(
      { error: "No image data in Imagen response" },
      { status: 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
