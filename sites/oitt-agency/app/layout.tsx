import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers/Providers";

export const metadata: Metadata = {
  title: "OITT — Digital Agency | סוכנות דיגיטל",
  description:
    "OITT Internet Agency — Web development, UI/UX design, and digital marketing. סוכנות אינטרנט OITT — פיתוח אתרים, עיצוב ושיווק דיגיטלי.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className="theme-dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("oitt-theme");if(t==="light"||t==="dark"){document.documentElement.className="theme-"+t}else if(window.matchMedia("(prefers-color-scheme:light)").matches){document.documentElement.className="theme-light"}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
