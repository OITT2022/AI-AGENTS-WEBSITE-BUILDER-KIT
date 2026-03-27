"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translations, type Locale } from "../translations";

type Translations = (typeof translations)[Locale];

interface LanguageContextValue {
  locale: Locale;
  t: Translations;
  toggle: () => void;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "he",
  t: translations.he,
  toggle: () => {},
  dir: "rtl",
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("he");

  useEffect(() => {
    const stored = localStorage.getItem("oitt-lang") as Locale | null;
    if (stored && (stored === "he" || stored === "en")) {
      setLocale(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("dir", translations[locale].dir);
    document.documentElement.setAttribute("lang", locale);
    localStorage.setItem("oitt-lang", locale);
  }, [locale]);

  const toggle = () => setLocale((l) => (l === "he" ? "en" : "he"));

  const t = translations[locale];

  return (
    <LanguageContext.Provider value={{ locale, t, toggle, dir: t.dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
