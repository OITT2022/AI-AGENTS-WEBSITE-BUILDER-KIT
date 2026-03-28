import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const hasToken = !!cookieStore.get("google_access_token")?.value;
  const hasRefresh = !!cookieStore.get("google_refresh_token")?.value;

  return Response.json({ connected: hasToken || hasRefresh });
}
