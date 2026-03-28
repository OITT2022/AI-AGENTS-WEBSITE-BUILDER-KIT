import { getSession } from "../../../lib/auth";

// Must match exactly what's registered in Google Cloud Console
const REDIRECT_URI = "https://www.2op.co.il/api/auth/google/callback";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized — please log in first", { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response("GOOGLE_CLIENT_ID not configured", { status: 500 });
  }

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent("https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email")}&access_type=offline&prompt=consent`;

  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}
