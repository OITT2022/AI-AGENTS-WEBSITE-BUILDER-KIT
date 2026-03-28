export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const html = (msg: string) => new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;"><p>${msg}</p><script>setTimeout(function(){window.close()},2000)</script></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );

  if (error || !code) return html("שגיאה בהתחברות: " + (error || "no code"));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = "https://www.2op.co.il/api/auth/google/callback";

  if (!clientId || !clientSecret) return html("Google OAuth לא מוגדר");

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

  if (!tokenRes.ok) return html("שגיאה בקבלת טוקן מגוגל");

  const tokens = await tokenRes.json();

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

  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">
<p style="font-size:18px;color:#10b981;">✓ Google Drive מחובר בהצלחה</p>
<p style="color:#888;">החלון ייסגר אוטומטית...</p>
<script>setTimeout(function(){window.close()},1500)</script>
</body></html>`,
    { headers }
  );
}
