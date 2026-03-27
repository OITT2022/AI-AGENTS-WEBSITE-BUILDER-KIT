import { test, expect } from "@playwright/test";

/**
 * QA Agent — Site Builder checks
 * Target: http://localhost:3100
 */

test.describe("Site Builder — Smoke", () => {
  test("page loads successfully", async ({ page }) => {
    await page.goto("http://localhost:3100");
    await expect(page).toHaveTitle(/Site Builder/);
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("http://localhost:3100");
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});

test.describe("Site Builder — Layout", () => {
  test("has split panel layout", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const formPanel = page.locator(".form-panel");
    const previewPanel = page.locator(".preview-panel");
    await expect(formPanel).toBeVisible();
    await expect(previewPanel).toBeVisible();
  });

  test("has resize handle", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const handle = page.locator(".resize-handle");
    await expect(handle).toBeVisible();
  });

  test("title is visible", async ({ page }) => {
    await page.goto("http://localhost:3100");
    await expect(page.locator(".panel-title")).toContainText("Site Builder");
  });
});

test.describe("Site Builder — Step 1: Firecrawl", () => {
  test("URL input and scan button exist", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const urlInput = page.locator("input#url");
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveAttribute("type", "url");
    const scanBtn = page.locator("button", { hasText: "סרוק" });
    await expect(scanBtn).toBeVisible();
  });

  test("scan button is disabled without URL", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const scanBtn = page.locator("button", { hasText: "סרוק" });
    await expect(scanBtn).toBeDisabled();
  });

  test("scan button enables with URL", async ({ page }) => {
    await page.goto("http://localhost:3100");
    await page.locator("input#url").fill("https://example.com");
    const scanBtn = page.locator("button", { hasText: "סרוק" });
    await expect(scanBtn).toBeEnabled();
  });

  test("step number 1 is visible", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const step = page.locator(".step-number", { hasText: "1" });
    await expect(step).toBeVisible();
  });
});

test.describe("Site Builder — Step 2: Tavily", () => {
  test("research textarea exists", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const textarea = page.locator("textarea#research");
    await expect(textarea).toBeVisible();
  });

  test("research button exists and disabled when empty", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const btn = page.locator("button", { hasText: "חקור" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test("research button enables with text", async ({ page }) => {
    await page.goto("http://localhost:3100");
    await page.locator("textarea#research").fill("test research");
    const btn = page.locator("button", { hasText: "חקור" });
    await expect(btn).toBeEnabled();
  });
});

test.describe("Site Builder — Step 3: Nano Banana", () => {
  test("media textarea exists", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const textarea = page.locator("textarea#media");
    await expect(textarea).toBeVisible();
  });

  test("media button exists", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const btn = page.locator("button", { hasText: "צור מדיות" });
    await expect(btn).toBeVisible();
  });
});

test.describe("Site Builder — Step 4: Generate", () => {
  test("site description textarea exists", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const textarea = page.locator("textarea#siteDesc");
    await expect(textarea).toBeVisible();
  });

  test("site name input exists", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const input = page.locator("input#siteName");
    await expect(input).toBeVisible();
  });

  test("generate button exists and disabled initially", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const btn = page.locator("button", { hasText: "בנה אתר" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });
});

test.describe("Site Builder — Preview Panel", () => {
  test("preview header is visible", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const header = page.locator(".preview-header");
    await expect(header).toBeVisible();
  });

  test("empty state shows placeholder", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const empty = page.locator(".preview-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("הנתונים שיופקו יוצגו כאן");
  });
});

test.describe("Site Builder — Log", () => {
  test("log area exists with idle message", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const log = page.locator(".log-area");
    await expect(log).toBeVisible();
    await expect(log).toContainText("ממתין לפעולה");
  });
});

test.describe("Site Builder — All 4 Steps Present", () => {
  test("all step numbers 1-4 are rendered", async ({ page }) => {
    await page.goto("http://localhost:3100");
    for (const n of ["1", "2", "3", "4"]) {
      await expect(page.locator(".step-number", { hasText: n })).toBeVisible();
    }
  });

  test("all step labels are present", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const body = await page.textContent("body");
    expect(body).toContain("Firecrawl");
    expect(body).toContain("Tavily");
    expect(body).toContain("Nano Banana");
    expect(body).toContain("Claude AI");
  });
});

test.describe("Site Builder — SEO & Accessibility", () => {
  test("html has lang attribute", async ({ page }) => {
    await page.goto("http://localhost:3100");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("html has dir=rtl", async ({ page }) => {
    await page.goto("http://localhost:3100");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("has meta description", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute("content", /.+/);
  });

  test("all form inputs have ids", async ({ page }) => {
    await page.goto("http://localhost:3100");
    const inputs = page.locator("input, textarea");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const id = await inputs.nth(i).getAttribute("id");
      expect(id, `Input ${i} missing id`).toBeTruthy();
    }
  });
});

test.describe("Site Builder — API Routes", () => {
  test("/api/scrape returns error without body", async ({ request }) => {
    const res = await request.post("http://localhost:3100/api/scrape", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("/api/research returns error without body", async ({ request }) => {
    const res = await request.post("http://localhost:3100/api/research", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("/api/media returns error without body", async ({ request }) => {
    const res = await request.post("http://localhost:3100/api/media", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
