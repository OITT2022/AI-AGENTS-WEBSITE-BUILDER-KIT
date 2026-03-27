import {
  SiteInputSchema,
  SiteOutputSchema,
  type SiteInput,
  type SiteOutput,
  type SiteArtifact,
} from "./schemas.js";
import { buildSitePrompt } from "./prompts.js";

interface SiteAgentConfig {
  githubToken?: string;
  vercelToken?: string;
}

export class SiteAgent {
  private readonly config: SiteAgentConfig;

  constructor(config?: SiteAgentConfig) {
    this.config = config ?? {};
  }

  async run(input: unknown): Promise<SiteOutput> {
    const validated = SiteInputSchema.parse(input);
    const _prompt = buildSitePrompt(validated);

    const projectName = this.generateProjectName(validated.brief);
    const structure = this.generateProjectStructure(validated);
    const hasAuth = validated.features?.includes("auth") ?? false;
    const hasAdmin = validated.features?.includes("admin") ?? false;

    const artifacts: SiteArtifact[] = structure.map((filePath) => ({
      type: this.getArtifactType(filePath),
      path: filePath,
    }));

    if (validated.database !== "none") {
      const prismaPath = `${projectName}/prisma/schema.prisma`;
      artifacts.push({ type: "schema", path: prismaPath });
    }

    const output: SiteOutput = {
      projectName,
      pages: this.extractPages(structure),
      hasAdmin,
      hasAuth,
      database: validated.database,
      artifacts,
    };

    return SiteOutputSchema.parse(output);
  }

  private generateProjectName(brief: string): string {
    return brief
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .slice(0, 3)
      .join("-");
  }

  private generateProjectStructure(input: SiteInput): string[] {
    const name = this.generateProjectName(input.brief);
    const files: string[] = [];

    switch (input.framework) {
      case "nextjs":
        files.push(
          `${name}/package.json`,
          `${name}/next.config.js`,
          `${name}/tsconfig.json`,
          `${name}/app/layout.tsx`,
          `${name}/app/page.tsx`,
          `${name}/app/globals.css`,
          `${name}/public/favicon.ico`,
        );
        if (input.language === "he" || input.language === "ar") {
          files.push(`${name}/app/rtl-provider.tsx`);
        }
        break;
      case "astro":
        files.push(
          `${name}/package.json`,
          `${name}/astro.config.mjs`,
          `${name}/tsconfig.json`,
          `${name}/src/layouts/Layout.astro`,
          `${name}/src/pages/index.astro`,
          `${name}/public/favicon.ico`,
        );
        break;
      case "html":
        files.push(
          `${name}/index.html`,
          `${name}/styles.css`,
          `${name}/script.js`,
        );
        break;
    }

    if (input.features?.includes("auth")) {
      files.push(`${name}/app/auth/login/page.tsx`);
      files.push(`${name}/app/auth/register/page.tsx`);
    }

    if (input.features?.includes("admin")) {
      files.push(`${name}/app/admin/page.tsx`);
      files.push(`${name}/app/admin/layout.tsx`);
    }

    return files;
  }

  private generatePrismaSchema(input: SiteInput): string {
    const provider =
      input.database === "postgresql" ? "postgresql" : "sqlite";
    const url =
      input.database === "postgresql"
        ? 'env("DATABASE_URL")'
        : '"file:./dev.db"';

    return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${provider}"
  url      = ${url}
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`;
  }

  private extractPages(structure: string[]): string[] {
    return structure
      .filter(
        (f) =>
          f.endsWith("page.tsx") ||
          f.endsWith("index.astro") ||
          f.endsWith("index.html"),
      )
      .map((f) => {
        const parts = f.split("/");
        const pageIndex = parts.indexOf("app");
        if (pageIndex >= 0) {
          const route = parts.slice(pageIndex + 1, -1).join("/");
          return route || "/";
        }
        return "/";
      });
  }

  private getArtifactType(filePath: string): string {
    if (filePath.endsWith(".tsx") || filePath.endsWith(".astro")) return "page";
    if (filePath.endsWith(".css")) return "style";
    if (filePath.endsWith(".json")) return "config";
    if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "config";
    if (filePath.endsWith(".html")) return "page";
    return "asset";
  }
}

export type { SiteAgentConfig };
