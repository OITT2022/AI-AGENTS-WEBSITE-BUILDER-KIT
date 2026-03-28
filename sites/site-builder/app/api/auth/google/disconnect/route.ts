import { cookies } from "next/headers";
import { getSession } from "../../../../lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();

  // Revoke Google token if possible
  const accessToken = cookieStore.get("google_access_token")?.value;
  if (accessToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: "POST" });
    } catch {
      // Revoke is best-effort
    }
  }

  // Clear Google cookies
  cookieStore.delete("google_access_token");
  cookieStore.delete("google_refresh_token");

  return Response.json({ success: true });
}
