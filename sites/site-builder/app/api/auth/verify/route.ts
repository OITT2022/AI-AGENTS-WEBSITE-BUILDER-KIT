import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { signToken, createSessionCookie } from "../../../lib/auth";

export async function POST(req: Request) {
  const { email, code } = await req.json();

  if (!email || !code) {
    return NextResponse.json({ error: "אימייל וקוד נדרשים" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();
  const sql = getDb();

  // Find valid OTP
  const otps = await sql`
    SELECT id FROM otp_codes
    WHERE email = ${emailLower}
      AND code = ${code}
      AND used = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (otps.length === 0) {
    return NextResponse.json({ error: "קוד שגוי או שפג תוקפו" }, { status: 401 });
  }

  // Mark OTP as used
  await sql`UPDATE otp_codes SET used = TRUE WHERE id = ${otps[0].id}`;

  // Get user
  const users = await sql`
    SELECT id, first_name, last_name, email, admin FROM users WHERE email = ${emailLower}
  `;

  if (users.length === 0) {
    return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
  }

  const user = users[0];

  // Sign JWT
  const isAdmin = user.admin === 1;

  const token = await signToken({
    userId: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    admin: isAdmin,
  });

  const res = NextResponse.json({
    success: true,
    user: {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      admin: isAdmin,
    },
  });

  res.headers.set("Set-Cookie", createSessionCookie(token));

  return res;
}
