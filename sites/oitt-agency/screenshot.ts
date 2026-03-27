import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3050", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Scroll slowly through the page to trigger all IntersectionObserver animations
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(300);
  }

  // Scroll back to top for hero screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  await page.screenshot({ path: "screenshot-top.png" });
  await page.screenshot({ path: "screenshot-full.png", fullPage: true });
  await browser.close();
  console.log("Screenshots saved.");
}

main().catch(console.error);
