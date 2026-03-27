import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("PAGE_ERROR: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("CONSOLE_ERROR: " + msg.text());
  });

  const response = await page.goto("https://site-builder-theta.vercel.app", {
    waitUntil: "networkidle",
  });

  console.log("STATUS:", response?.status());
  console.log("URL:", page.url());

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "screenshot-sb-vercel.png" });

  const bodyText = await page.textContent("body");
  console.log("BODY_TEXT:", bodyText?.slice(0, 500));
  console.log("ERRORS:", JSON.stringify(errors));

  await browser.close();
}

main().catch(console.error);
