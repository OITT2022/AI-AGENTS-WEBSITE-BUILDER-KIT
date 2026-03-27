import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { generateOTP } from "../../../lib/auth";
import { sendOTP } from "../../../lib/email";

export async function POST(req: Request) {
  const { firstName, lastName, email } = await req.json();

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "כל השדות נדרשים" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();
  const sql = getDb();

  // Check if user already exists
  const existing = await sql`SELECT id FROM users WHERE email = ${emailLower}`;
  if (existing.length > 0) {
    return NextResponse.json({ exists: true });
  }

  // Create user
  await sql`
    INSERT INTO users (first_name, last_name, email)
    VALUES (${firstName.trim()}, ${lastName.trim()}, ${emailLower})
  `;

  // Rate limit: check if OTP was sent in last 60 seconds
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

  return NextResponse.json({ success: true });
}
