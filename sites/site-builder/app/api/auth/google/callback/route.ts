export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return new Response(
      `<html><body><p>Google auth failed: ${error || "no code"}</p><button onclick="window.close()">סגור</button></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = "https://www.2op.co.il/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    return new Response("Google OAuth not configured", { status: 500 });
  }

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
      `<html><body><p>Token error</p><pre>${err.slice(0, 300)}</pre><button onclick="window.close()">סגור</button></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const tokens = await tokenRes.json();

  // Set cookies via headers
  const headers = new Headers();
  headers.set("Content-Type", "text/html");
  headers.append("Set-Cookie",
    `google_access_token=${tokens.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${tokens.expires_in || 3600}`
  );
  if (tokens.refresh_token) {
    headers.append("Set-Cookie",
      `google_refresh_token=${tokens.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
    );
  }

  // Notify parent and close popup
  return new Response(
    `<!DOCTYPE html>
<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
<p>Google Drive מחובר בהצלחה!</p>
<p style="color:#888;font-size:14px;">החלון ייסגר אוטומטית...</p>
<script>
  try { window.opener && window.opener.postMessage({type:"google-auth-success"}, "*"); } catch(e) {}
  setTimeout(function(){ window.close(); }, 1000);
</script>
</body></html>`,
    { headers }
  );
}
