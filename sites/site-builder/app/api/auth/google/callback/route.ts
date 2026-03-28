export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return Response.redirect(new URL("/?drive_error=" + encodeURIComponent(error || "no_code"), url.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = "https://www.2op.co.il/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    return Response.redirect(new URL("/?drive_error=not_configured", url.origin));
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
    return Response.redirect(new URL("/?drive_error=token_failed", url.origin));
  }

  const tokens = await tokenRes.json();

  // Redirect back to home with cookies set
  const headers = new Headers();
  headers.set("Location", "/");
  headers.append("Set-Cookie",
    `google_access_token=${tokens.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${tokens.expires_in || 3600}`
  );
  if (tokens.refresh_token) {
    headers.append("Set-Cookie",
      `google_refresh_token=${tokens.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
    );
  }

  return new Response(null, { status: 302, headers });
}
