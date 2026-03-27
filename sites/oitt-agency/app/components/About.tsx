"use client";

import { useLanguage } from "../providers/LanguageProvider";

const STAT_COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981"];

export default function About() {
  const { t } = useLanguage();

  return (
    <section id="about" className="section">
      <div className="fade-in">
        <h2 className="section-title">{t.about.title}</h2>
        <p className="section-subtitle">{t.about.subtitle}</p>
      </div>

      {/* Stats row */}
      <div
        className="fade-in"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "1.25rem",
          marginBottom: "3rem",
        }}
      >
        {t.about.stats.map((stat, i) => (
          <div
            key={i}
            className="card"
            style={{
              textAlign: "center",
              padding: "1.5rem 1rem",
            }}
          >
            <div
              style={{
                fontSize: "2.25rem",
                fontWeight: 800,
                color: STAT_COLORS[i],
                marginBottom: "0.25rem",
              }}
            >
              {stat.value}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div className="fade-in" style={{ maxWidth: 700, margin: "0 auto" }}>
        <p
          style={{
            textAlign: "center",
            fontSize: "1.1rem",
            lineHeight: 1.8,
            color: "var(--text-muted)",
          }}
        >
          {t.about.description}
        </p>
      </div>
    </section>
  );
}
