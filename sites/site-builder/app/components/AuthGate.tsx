"use client";

import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WebGLBackground } from "./ui/webgl-background";

type AuthStep = "register" | "login" | "verify";

export default function AuthGate() {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email }),
      });
      const data = await res.json();

      if (data.exists) {
        // User already exists — switch to login and auto-send OTP
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const loginData = await loginRes.json();
        if (loginData.error) { setError(loginData.error); setLoading(false); return; }
        setStep("verify");
        startCooldown();
      } else if (data.error) {
        setError(data.error);
      } else {
        setStep("verify");
        startCooldown();
      }
    } catch {
      setError("שגיאת תקשורת");
    }
    setLoading(false);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.notFound) {
        setError("משתמש לא נמצא — נא להירשם");
        setStep("register");
      } else if (data.error) {
        setError(data.error);
      } else {
        setStep("verify");
        startCooldown();
      }
    } catch {
      setError("שגיאת תקשורת");
    }
    setLoading(false);
  }

  async function handleVerify() {
    const code = otp.join("");
    if (code.length !== 6) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
      } else {
        router.refresh();
      }
    } catch {
      setError("שגיאת תקשורת");
    }
    setLoading(false);
  }

  async function handleResendOTP() {
    if (resendCooldown > 0) return;
    setError("");

    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      startCooldown();
    } catch {
      setError("שגיאה בשליחה חוזרת");
    }
  }

  function startCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit on last digit
    if (value && index === 5) {
      const code = newOtp.join("");
      if (code.length === 6) {
        setTimeout(() => handleVerify(), 100);
      }
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] ?? "";
    }
    setOtp(newOtp);

    // Focus last filled input
    const lastIndex = Math.min(pasted.length, 6) - 1;
    otpRefs.current[lastIndex]?.focus();

    // Auto-submit if full code pasted
    if (pasted.length === 6) {
      setTimeout(() => handleVerify(), 100);
    }
  }

  function handleOtpKeyDown(index: number, key: string) {
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  return (
    <WebGLBackground>
      <div className="auth-card">
        {step === "register" && (
          <form onSubmit={handleRegister}>
            <h1 className="auth-title">ברוך הבא</h1>
            <p className="auth-subtitle">הרשם כדי להשתמש ב-AI Site Builder</p>

            <div className="auth-field">
              <label htmlFor="firstName">שם פרטי</label>
              <input id="firstName" type="text" className="form-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
            </div>
            <div className="auth-field">
              <label htmlFor="lastName">שם משפחה</label>
              <input id="lastName" type="text" className="form-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="auth-field">
              <label htmlFor="authEmail">אימייל</label>
              <input id="authEmail" type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="btn btn-generate auth-submit" disabled={loading}>
              {loading ? <span className="spinner" /> : "הרשמה"}
            </button>

            <p className="auth-switch">
              כבר יש לך חשבון?{" "}
              <button type="button" onClick={() => { setStep("login"); setError(""); }}>התחבר</button>
            </p>
            <p className="auth-legal">
              בהרשמה אתה מסכים ל<a href="/terms" target="_blank">תנאי השימוש</a> ול<a href="/privacy" target="_blank">מדיניות הפרטיות</a>
            </p>
          </form>
        )}

        {step === "login" && (
          <form onSubmit={handleLogin}>
            <h1 className="auth-title">התחברות</h1>
            <p className="auth-subtitle">הזן את כתובת המייל שלך לקבלת קוד כניסה</p>

            <div className="auth-field">
              <label htmlFor="loginEmail">אימייל</label>
              <input id="loginEmail" type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" autoFocus />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="btn btn-generate auth-submit" disabled={loading}>
              {loading ? <span className="spinner" /> : "שלח קוד"}
            </button>

            <p className="auth-switch">
              משתמש חדש?{" "}
              <button type="button" onClick={() => { setStep("register"); setError(""); }}>הרשמה</button>
            </p>
          </form>
        )}

        {step === "verify" && (
          <div>
            <h1 className="auth-title">הזן קוד אימות</h1>
            <p className="auth-subtitle">שלחנו קוד בן 6 ספרות ל-<span dir="ltr">{email}</span></p>

            <div className="otp-inputs">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className="otp-box"
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e.key)}
                  onPaste={handleOtpPaste}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="btn btn-generate auth-submit" onClick={handleVerify} disabled={loading || otp.join("").length !== 6}>
              {loading ? <span className="spinner" /> : "אימות"}
            </button>

            <p className="auth-resend">
              {resendCooldown > 0 ? (
                <span>שליחה חוזרת בעוד {resendCooldown} שניות</span>
              ) : (
                <button type="button" onClick={handleResendOTP}>שלח קוד חדש</button>
              )}
            </p>
          </div>
        )}
      </div>
    </WebGLBackground>
  );
}
