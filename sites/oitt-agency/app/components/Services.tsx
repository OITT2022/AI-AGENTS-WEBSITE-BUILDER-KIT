"use client";

import { useLanguage } from "../providers/LanguageProvider";

const SERVICE_COLORS = [
  "#6366f1", "#06b6d4", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981",
];

export default function Services() {
  const { t } = useLanguage();

  return (
    <section id="services" className="section">
      <div className="fade-in">
        <h2 className="section-title">{t.services.title}</h2>
        <p className="section-subtitle">{t.services.subtitle}</p>
      </div>

      <div className="grid-3">
        {t.services.items.map((item, i) => (
          <div
            key={i}
            className="card fade-in"
            style={{ transitionDelay: `${i * 0.1}s` }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "0.875rem",
                background: `${SERVICE_COLORS[i]}15`,
                border: `1px solid ${SERVICE_COLORS[i]}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.75rem",
                marginBottom: "1.25rem",
              }}
            >
              {item.icon}
            </div>
            <h3
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
                color: "var(--text)",
              }}
            >
              {item.title}
            </h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, fontSize: "0.95rem" }}>
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
