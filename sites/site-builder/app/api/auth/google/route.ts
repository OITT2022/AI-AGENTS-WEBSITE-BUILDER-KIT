import { getSession } from "../../../lib/auth";

export const runtime = "edge";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || "https://site-builder-v2-phi.vercel.app"}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: session.userId,
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
