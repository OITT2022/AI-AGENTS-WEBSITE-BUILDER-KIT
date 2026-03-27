import { test, expect } from "@playwright/test";

test.describe("Content Checks", () => {
  test("dashboard page has meaningful content", async ({ page }) => {
    await page.goto("/");
    const text = await page.textContent("body");
    expect(text?.length).toBeGreaterThan(50);
  });

  test("runs page displays table", async ({ page }) => {
    await page.goto("/runs");
    const table = page.locator("table");
    await expect(table).toBeVisible();
  });

  test("settings page shows agent list", async ({ page }) => {
    await page.goto("/settings");
    const content = await page.textContent("body");
    expect(content).toContain("research-agent");
    expect(content).toContain("content-agent");
    expect(content).toContain("site-agent");
    expect(content).toContain("media-agent");
    expect(content).toContain("qa-agent");
  });
});
