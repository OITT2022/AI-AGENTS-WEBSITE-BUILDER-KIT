import { test, expect } from "@playwright/test";

test.describe("Form Checks", () => {
  test("settings page renders without errors", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText(/settings/i);
  });
});
