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

  // Get file content as base64
  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!driveRes.ok) {
    return Response.json({ error: `Drive error: ${driveRes.status}` }, { status: driveRes.status });
  }

  // Get metadata for mime type
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const meta = await metaRes.json();

  const buffer = await driveRes.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const dataUrl = `data:${meta.mimeType};base64,${base64}`;

  return Response.json({
    name: meta.name,
    mimeType: meta.mimeType,
    size: meta.size,
    dataUrl,
  });
}
