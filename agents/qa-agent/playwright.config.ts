import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.QA_TARGET_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  reporter: [
    ["html", { outputFolder: "reports/html" }],
    ["json", { outputFile: "reports/results.json" }],
    ["list"],
  ],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
