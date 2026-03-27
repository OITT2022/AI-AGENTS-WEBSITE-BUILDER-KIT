/**
 * Asset generation script for OITT site.
 * Uses the Media Agent with SVG provider to generate all site visuals.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MediaAgent } from "../../../agents/media-agent/src/agent.js";
import { SvgImageProvider } from "../../../agents/media-agent/src/svg-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../public");

async function main() {
  // Set up Media Agent with SVG provider
  const svgProvider = new SvgImageProvider(PUBLIC_DIR);
  const providers = new Map([["svg-generator", svgProvider]]);
  const agent = new MediaAgent(providers);

  console.log("Generating OITT site assets via Media Agent...\n");

  // ── Hero banner ──
  const heroBanner = await agent.run({
    type: "image",
    prompt: "oitt-hero-banner digital agency abstract technology",
    style: "modern",
    dimensions: { width: 1920, height: 1080 },
    format: "svg",
  });
  console.log(`  Hero banner: ${heroBanner.url}`);

  // ── Portfolio items ──
  const portfolioItems = [
    { prompt: "portfolio-fashion-store ecommerce elegant shopping", style: "creative" },
    { prompt: "portfolio-management-app dashboard analytics data", style: "corporate" },
    { prompt: "portfolio-law-firm professional corporate trust", style: "corporate" },
    { prompt: "portfolio-booking-platform saas reservation modern", style: "cool" },
    { prompt: "portfolio-news-portal media content publishing", style: "warm" },
    { prompt: "portfolio-startup-landing innovation tech growth", style: "modern" },
  ];

  for (const item of portfolioItems) {
    const result = await agent.run({
      type: "image",
      prompt: item.prompt,
      style: item.style,
      dimensions: { width: 800, height: 500 },
      format: "svg",
    });
    console.log(`  Portfolio: ${result.url}`);
  }

  // ── Service icons ──
  const services = [
    { prompt: "service-web-development code browser website", style: "modern" },
    { prompt: "service-web-applications dashboard interface app", style: "cool" },
    { prompt: "service-ui-ux-design creative palette wireframe", style: "creative" },
    { prompt: "service-digital-marketing growth chart social", style: "warm" },
    { prompt: "service-ecommerce cart shopping online store", style: "modern" },
    { prompt: "service-maintenance support tools gear shield", style: "nature" },
  ];

  for (const svc of services) {
    const result = await agent.run({
      type: "image",
      prompt: svc.prompt,
      style: svc.style,
      dimensions: { width: 400, height: 400 },
      format: "svg",
    });
    console.log(`  Service:   ${result.url}`);
  }

  // ── About section background ──
  const aboutBg = await agent.run({
    type: "image",
    prompt: "about-section-background team collaboration abstract",
    style: "corporate",
    dimensions: { width: 1200, height: 600 },
    format: "svg",
  });
  console.log(`  About bg:  ${aboutBg.url}`);

  console.log("\nAll assets generated successfully!");
}

main().catch(console.error);
