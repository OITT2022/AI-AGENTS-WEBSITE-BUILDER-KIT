export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return new Response(
      `<html><body><script>alert("Google auth failed: ${error || "no code"}");window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = "https://www.2op.co.il/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    return new Response(
      `<html><body><script>alert("Google OAuth not configured");window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
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
    return new Response(
      `<html><body><script>alert("Token exchange error");window.close();</script><pre>${err.slice(0, 200)}</pre></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const tokens = await tokenRes.json();

  // Set cookies via response headers (more reliable than next/headers cookies())
  const cookieHeaders: string[] = [];

  cookieHeaders.push(
    `google_access_token=${tokens.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${tokens.expires_in || 3600}`
  );

  if (tokens.refresh_token) {
    cookieHeaders.push(
      `google_refresh_token=${tokens.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/html");
  for (const cookie of cookieHeaders) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(
    `<!DOCTYPE html>
<html><body>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;">Google Drive מחובר בהצלחה!</p>
<script>
  setTimeout(function() {
    try { if (window.opener) window.opener.postMessage({ type: "google-auth-success" }, "*"); } catch(e) {}
    setTimeout(function() { window.close(); }, 500);
  }, 300);
</script>
</body></html>`,
    { headers }
  );
}
