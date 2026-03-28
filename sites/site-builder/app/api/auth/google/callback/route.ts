import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return new Response(`<html><body><script>window.close();alert("Google auth failed: ${error || "no code"}")</script></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || "https://site-builder-v2-phi.vercel.app"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return new Response("Google OAuth not configured", { status: 500 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`<html><body><script>alert("Token error: ${err.slice(0, 100)}");window.close();</script></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  }

  const tokens = await tokenRes.json();

  // Store Google tokens in a cookie (httpOnly)
  const cookieStore = await cookies();
  cookieStore.set("google_access_token", tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: tokens.expires_in || 3600,
    path: "/",
  });

  if (tokens.refresh_token) {
    cookieStore.set("google_refresh_token", tokens.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
  }

  // Close popup and notify parent
  return new Response(
    `<!DOCTYPE html>
<html><body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "google-auth-success" }, "*");
  }
  window.close();
</script>
<p>Connected! You can close this window.</p>
</body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
