import { getSession } from "../../../lib/auth";
import { headers } from "next/headers";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized — please log in first", { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response("GOOGLE_CLIENT_ID not configured", { status: 500 });
  }

  // Derive base URL from the request itself
  const headersList = await headers();
  const host = headersList.get("host") || "site-builder-v2-phi.vercel.app";
  const proto = headersList.get("x-forwarded-proto") || "https";
  const baseUrl = `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const scope = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email";

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}
