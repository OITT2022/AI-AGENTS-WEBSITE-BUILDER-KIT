import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { generateOTP } from "../../../lib/auth";
import { sendOTP } from "../../../lib/email";

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "אימייל נדרש" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();
  const sql = getDb();

  // Check if user exists
  const users = await sql`
    SELECT id, first_name, last_name FROM users WHERE email = ${emailLower}
  `;
  if (users.length === 0) {
    return NextResponse.json({ notFound: true });
  }

  // Rate limit
  const recent = await sql`
    SELECT id FROM otp_codes
    WHERE email = ${emailLower} AND created_at > NOW() - INTERVAL '60 seconds'
  `;
  if (recent.length > 0) {
    return NextResponse.json({ error: "נא להמתין דקה לפני שליחת קוד חדש" }, { status: 429 });
  }

  // Generate and send OTP
  const code = generateOTP();
  await sql`
    INSERT INTO otp_codes (email, code, expires_at)
    VALUES (${emailLower}, ${code}, NOW() + INTERVAL '10 minutes')
  `;

  try {
    await sendOTP(emailLower, code);
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    return NextResponse.json({ error: "שגיאה בשליחת מייל" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    firstName: users[0].first_name,
  });
}
