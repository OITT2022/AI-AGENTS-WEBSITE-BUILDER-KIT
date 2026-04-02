import fs from "node:fs/promises";
import path from "node:path";

export class FileStorage {
  constructor(private readonly outputDir: string, private readonly publicAssetBaseUrl: string) {}

  async ensureOutputDir(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async writeJson<T>(fileName: string, payload: T): Promise<string> {
    await this.ensureOutputDir();
    const fullPath = path.join(this.outputDir, fileName);
    await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), "utf8");
    return `${this.publicAssetBaseUrl}/${fileName}`;
  }
}
