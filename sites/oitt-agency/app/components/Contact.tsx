"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "../providers/LanguageProvider";

export default function Contact() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("sending");

    // Simulate send
    setTimeout(() => {
      setStatus("success");
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setStatus("idle"), 4000);
    }, 1500);
  };

  return (
    <section
      id="contact"
      className="section"
      style={{ paddingBottom: "3rem" }}
    >
      <div className="fade-in">
        <h2 className="section-title">{t.contact.title}</h2>
        <p className="section-subtitle">{t.contact.subtitle}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="fade-in card"
        style={{
          maxWidth: 600,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div className="grid-2">
          <div>
            <label
              htmlFor="name"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {t.contact.name}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="form-input"
              placeholder={t.contact.name}
            />
          </div>
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {t.contact.email}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="form-input"
              placeholder={t.contact.email}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="phone"
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {t.contact.phone}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="form-input"
            placeholder={t.contact.phone}
          />
        </div>

        <div>
          <label
            htmlFor="message"
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {t.contact.message}
          </label>
          <textarea
            id="message"
            name="message"
            required
            className="form-input"
            placeholder={t.contact.message}
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={status === "sending"}
          style={{
            alignSelf: "flex-start",
            opacity: status === "sending" ? 0.7 : 1,
          }}
        >
          {status === "sending" ? t.contact.sending : t.contact.send}
        </button>

        {status === "success" && (
          <p style={{ color: "#10b981", fontWeight: 500 }}>
            {t.contact.success}
          </p>
        )}
        {status === "error" && (
          <p style={{ color: "#ef4444", fontWeight: 500 }}>
            {t.contact.error}
          </p>
        )}
      </form>
    </section>
  );
}
