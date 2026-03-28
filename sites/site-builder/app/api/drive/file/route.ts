import { cookies } from "next/headers";
import { getSession } from "../../../lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("google_access_token")?.value;
  if (!accessToken) {
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileId = url.searchParams.get("id");
  if (!fileId) {
    return Response.json({ error: "File ID required" }, { status: 400 });
  }

  try {
    // Get metadata first
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!metaRes.ok) {
      return Response.json({ error: `Drive metadata error: ${metaRes.status}` }, { status: metaRes.status });
    }

    const meta = await metaRes.json();

    // Download file content
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!driveRes.ok) {
      return Response.json({ error: `Drive download error: ${driveRes.status}` }, { status: driveRes.status });
    }

    const buffer = await driveRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Convert to base64 in chunks (avoid call stack overflow on large files)
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:${meta.mimeType};base64,${base64}`;

    return Response.json({
      name: meta.name,
      mimeType: meta.mimeType,
      size: meta.size,
      dataUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Drive file error: ${msg}` }, { status: 500 });
  }
}
