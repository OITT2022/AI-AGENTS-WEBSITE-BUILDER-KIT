import { Resend } from "resend";

export async function sendOTP(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to: email,
    subject: `קוד אימות: ${code}`,
    html: `
      <div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; text-align: center;">
        <h1 style="font-size: 24px; color: #1e293b; margin-bottom: 8px;">AI Site Builder</h1>
        <p style="color: #64748b; margin-bottom: 32px;">הקוד שלך לכניסה למערכת</p>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #6366f1;">${code}</span>
        </div>
        <p style="color: #94a3b8; font-size: 14px;">הקוד תקף ל-10 דקות</p>
        <p style="color: #cbd5e1; font-size: 12px; margin-top: 32px;">אם לא ביקשת קוד זה, התעלם מהודעה זו.</p>
      </div>
    `,
  });
}
