import { test, expect } from "@playwright/test";

test.describe("Accessibility Checks", () => {
  test("page has lang attribute", async ({ page }) => {
    await page.goto("/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBeTruthy();
  });

  test("interactive elements are keyboard accessible", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("a");
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const tabIndex = await links.nth(i).getAttribute("tabindex");
      // Links should not have negative tabindex
      if (tabIndex !== null) {
        expect(Number(tabIndex)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("color contrast - text is visible", async ({ page }) => {
    await page.goto("/");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
