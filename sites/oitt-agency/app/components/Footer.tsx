"use client";

import { useLanguage } from "../providers/LanguageProvider";

export default function Footer() {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "2.5rem 1.5rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
          }}
        >
          <span style={{ color: "var(--color-primary)" }}>OITT</span>
          <span style={{ opacity: 0.6, fontWeight: 400, marginInlineStart: 6 }}>
            agency
          </span>
        </div>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          {t.footer.tagline}
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            opacity: 0.6,
          }}
        >
          &copy; {year} OITT. {t.footer.rights}.
        </p>
      </div>
    </footer>
  );
}
