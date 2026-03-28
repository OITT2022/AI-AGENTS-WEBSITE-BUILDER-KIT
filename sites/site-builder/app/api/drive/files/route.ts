import { cookies } from "next/headers";
import { getSession } from "../../../lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let accessToken = cookieStore.get("google_access_token")?.value;

  if (!accessToken) {
    const refreshToken = cookieStore.get("google_refresh_token")?.value;
    if (!refreshToken) {
      return Response.json({ error: "not_connected" }, { status: 401 });
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
      return Response.json({ error: "not_connected" }, { status: 401 });
    }

    const tokens = await refreshRes.json();
    accessToken = tokens.access_token;

    cookieStore.set("google_access_token", tokens.access_token, {
      httpOnly: true, secure: true, sameSite: "lax",
      maxAge: tokens.expires_in || 3600, path: "/",
    });
  }

  const url = new URL(req.url);
  const searchQuery = url.searchParams.get("q") || "";
  const folderId = url.searchParams.get("folderId") || "";

  // Build query
  let q = "trashed = false";
  if (folderId) {
    q += ` and '${folderId}' in parents`;
  } else if (searchQuery) {
    q += ` and name contains '${searchQuery.replace(/'/g, "\\'")}'`;
  } else {
    q += ` and 'root' in parents`;
  }

  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,thumbnailLink,size,modifiedTime)",
    pageSize: "100",
  });

  // Include items from shared drives
  params.set("includeItemsFromAllDrives", "true");
  params.set("supportsAllDrives", "true");

  const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!driveRes.ok) {
    const errText = await driveRes.text();
    return Response.json(
      { error: `Drive API error (${driveRes.status}): ${errText.slice(0, 300)}` },
      { status: driveRes.status }
    );
  }

  const data = await driveRes.json();

  return Response.json({
    files: data.files ?? [],
  });
}
