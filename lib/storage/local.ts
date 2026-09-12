import fs from "fs/promises";
import path from "path";
import type { StorageProvider, PutOptions } from "./index";

/**
 * Local filesystem storage provider.
 * FOR DEVELOPMENT ONLY.
 * Files are stored in ./storage/ relative to the project root.
 * Do not use in production environments with ephemeral filesystems.
 */
export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(process.cwd(), "storage");
  }

  private resolve(key: string): string {
    // Prevent path traversal attacks
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.basePath, normalized);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(key: string, data: Buffer, _options?: PutOptions): Promise<string> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const filePath = this.resolve(key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    // Local dev: serve through authenticated API route
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    // expiresInSeconds is noted but not enforced locally — API route handles auth
    void expiresInSeconds;
    return `${appUrl}/api/storage/${encodeURIComponent(key)}`;
  }
}
