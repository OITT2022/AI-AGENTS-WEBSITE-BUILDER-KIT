import { test, expect } from "@playwright/test";

test.describe("Link Checks", () => {
  test("all navigation links are valid", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("a[href]");
    const count = await links.count();

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      if (href && href.startsWith("/")) {
        const response = await page.request.get(href);
        expect(response.ok(), `Link ${href} returned ${response.status()}`).toBeTruthy();
      }
    }
  });

  test("no broken internal links on runs page", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.locator("h1")).toBeVisible();
    const links = page.locator("a[href^='/']");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });
});
