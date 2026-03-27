"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { LanguageProvider } from "./LanguageProvider";
import { ScrollObserver } from "./ScrollObserver";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ScrollObserver />
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}
