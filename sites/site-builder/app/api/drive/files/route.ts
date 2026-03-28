import { cookies } from "next/headers";
import { getSession } from "../../../lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let accessToken = cookieStore.get("google_access_token")?.value;

  // Try to refresh if no access token but refresh token exists
  if (!accessToken) {
    const refreshToken = cookieStore.get("google_refresh_token")?.value;
    if (!refreshToken) {
      return Response.json({ error: "not_connected", message: "Google not connected" }, { status: 401 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return Response.json({ error: "Google OAuth not configured" }, { status: 500 });
    }

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshRes.ok) {
      return Response.json({ error: "not_connected", message: "Token expired, reconnect" }, { status: 401 });
    }

    const tokens = await refreshRes.json();
    accessToken = tokens.access_token;

    cookieStore.set("google_access_token", tokens.access_token, {
      httpOnly: true, secure: true, sameSite: "lax",
      maxAge: tokens.expires_in || 3600, path: "/",
    });
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("q") || "";
  const folderId = url.searchParams.get("folderId") || "";
  const pageToken = url.searchParams.get("pageToken") || "";

  // Build Google Drive query
  let driveQuery = "trashed = false";

  if (folderId) {
    driveQuery += ` and '${folderId}' in parents`;
  }

  if (query) {
    driveQuery += ` and name contains '${query.replace(/'/g, "\\'")}'`;
  } else if (!folderId) {
    // Default: show images, PDFs, docs, and folders
    driveQuery += ` and (mimeType contains 'image/' or mimeType = 'application/pdf' or mimeType contains 'document' or mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'presentation')`;
  }

  const params = new URLSearchParams({
    q: driveQuery,
    fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,iconLink,size,modifiedTime,parents)",
    pageSize: "30",
    orderBy: "modifiedTime desc",
  });

  if (pageToken) params.set("pageToken", pageToken);

  const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!driveRes.ok) {
    const errText = await driveRes.text();
    return Response.json({ error: `Drive error: ${driveRes.status} — ${errText.slice(0, 200)}` }, { status: driveRes.status });
  }

  const data = await driveRes.json();

  return Response.json({
    files: data.files ?? [],
    nextPageToken: data.nextPageToken ?? null,
  });
}
