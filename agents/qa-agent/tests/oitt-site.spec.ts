import { test, expect } from "@playwright/test";

/**
 * QA Agent — OITT Internet Agency site checks
 * Target: http://localhost:3050
 */

test.describe("OITT Site — Smoke Tests", () => {
  test("homepage loads successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/OITT/);
  });

  test("page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});

test.describe("OITT Site — Navigation & Sections", () => {
  test("all nav links are present", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header");
    await expect(nav).toBeVisible();
    // Check for section anchor links
    for (const id of ["home", "services", "portfolio", "about", "contact"]) {
      const link = page.locator(`a[href="#${id}"]`).first();
      await expect(link).toBeVisible();
    }
  });

  test("hero section is visible with CTA buttons", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#home");
    await expect(hero).toBeVisible();
    // Should have at least 2 CTA buttons/links
    const ctas = hero.locator("a.btn-primary, a.btn-outline");
    await expect(ctas).toHaveCount(2);
  });

  test("services section has 6 cards", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#services");
    await expect(section).toBeVisible();
    const cards = section.locator(".card");
    await expect(cards).toHaveCount(6);
  });

  test("portfolio section has 6 items", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#portfolio");
    await expect(section).toBeVisible();
    const items = section.locator(".portfolio-item");
    await expect(items).toHaveCount(6);
  });

  test("about section has stat cards", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#about");
    await expect(section).toBeVisible();
    const stats = section.locator(".card");
    expect(await stats.count()).toBeGreaterThanOrEqual(4);
  });

  test("contact form is present with required fields", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("#contact form");
    await expect(form).toBeVisible();
    await expect(form.locator("input[name='name']")).toBeVisible();
    await expect(form.locator("input[name='email']")).toBeVisible();
    await expect(form.locator("textarea[name='message']")).toBeVisible();
    await expect(form.locator("button[type='submit']")).toBeVisible();
  });

  test("footer is present", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    const text = await footer.textContent();
    expect(text).toContain("OITT");
  });
});

test.describe("OITT Site — SEO Checks", () => {
  test("has proper meta title (under 70 chars)", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThan(70);
    expect(title).toContain("OITT");
  });

  test("has meta description", async ({ page }) => {
    await page.goto("/");
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute("content", /.{10,}/);
  });

  test("has exactly one H1", async ({ page }) => {
    await page.goto("/");
    const h1s = page.locator("h1");
    await expect(h1s).toHaveCount(1);
  });

  test("all images have alt text", async ({ page }) => {
    await page.goto("/");
    const images = page.locator("img:not([aria-hidden='true'])");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt, `Image ${i} missing alt text`).toBeTruthy();
    }
  });
});

test.describe("OITT Site — Accessibility", () => {
  test("html has lang attribute", async ({ page }) => {
    await page.goto("/");
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBeTruthy();
  });

  test("html has dir attribute", async ({ page }) => {
    await page.goto("/");
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBeTruthy();
  });

  test("form inputs have labels", async ({ page }) => {
    await page.goto("/");
    const inputs = page.locator("#contact input, #contact textarea");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const id = await inputs.nth(i).getAttribute("id");
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        expect(await label.count(), `Missing label for input#${id}`).toBeGreaterThan(0);
      }
    }
  });

  test("buttons and links have accessible text", async ({ page }) => {
    await page.goto("/");
    const buttons = page.locator("button");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute("aria-label");
      expect(
        (text && text.trim().length > 0) || ariaLabel,
        `Button ${i} has no accessible label`
      ).toBeTruthy();
    }
  });
});

test.describe("OITT Site — Assets (Media Agent)", () => {
  test("hero banner SVG loads", async ({ page }) => {
    const response = await page.request.get(
      "/oitt-hero-banner-digital-agency-abstract-technology.svg"
    );
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("svg");
  });

  test("all portfolio SVGs load", async ({ page }) => {
    const portfolioFiles = [
      "/portfolio-fashion-store-ecommerce-elegant-shopping.svg",
      "/portfolio-management-app-dashboard-analytics-data.svg",
      "/portfolio-law-firm-professional-corporate-trust.svg",
      "/portfolio-booking-platform-saas-reservation-modern.svg",
      "/portfolio-news-portal-media-content-publishing.svg",
      "/portfolio-startup-landing-innovation-tech-growth.svg",
    ];
    for (const file of portfolioFiles) {
      const response = await page.request.get(file);
      expect(response.ok(), `${file} failed to load`).toBeTruthy();
    }
  });

  test("all service SVGs load", async ({ page }) => {
    const serviceFiles = [
      "/service-web-development-code-browser-website.svg",
      "/service-web-applications-dashboard-interface-app.svg",
      "/service-ui-ux-design-creative-palette-wireframe.svg",
      "/service-digital-marketing-growth-chart-social.svg",
      "/service-ecommerce-cart-shopping-online-store.svg",
      "/service-maintenance-support-tools-gear-shield.svg",
    ];
    for (const file of serviceFiles) {
      const response = await page.request.get(file);
      expect(response.ok(), `${file} failed to load`).toBeTruthy();
    }
  });
});

test.describe("OITT Site — Bilingual Support", () => {
  test("language toggle button exists", async ({ page }) => {
    await page.goto("/");
    // Find the language toggle (shows "EN" or "עב")
    const langBtn = page.locator("button").filter({ hasText: /^(EN|עב)$/ }).first();
    await expect(langBtn).toBeVisible();
  });

  test("theme toggle button exists", async ({ page }) => {
    await page.goto("/");
    const themeBtn = page.locator("button[aria-label='Toggle theme']").first();
    await expect(themeBtn).toBeVisible();
  });
});

test.describe("OITT Site — Contact Form Validation", () => {
  test("form requires name and email", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("#contact form");
    const nameInput = form.locator("input[name='name']");
    const emailInput = form.locator("input[name='email']");

    // Check that inputs have required attribute
    await expect(nameInput).toHaveAttribute("required", "");
    await expect(emailInput).toHaveAttribute("required", "");
    await expect(emailInput).toHaveAttribute("type", "email");
  });
});

test.describe("OITT Site — Broken Links", () => {
  test("all internal anchor links point to existing sections", async ({ page }) => {
    await page.goto("/");
    const anchors = page.locator("a[href^='#']");
    const count = await anchors.count();
    for (let i = 0; i < count; i++) {
      const href = await anchors.nth(i).getAttribute("href");
      if (href && href !== "#") {
        const targetId = href.slice(1);
        const target = page.locator(`#${targetId}`);
        expect(
          await target.count(),
          `Anchor ${href} points to non-existent section`
        ).toBeGreaterThan(0);
      }
    }
  });
});
