/**
 * Storage provider abstraction.
 * Supports local filesystem (dev) and S3-compatible storage (prod).
 * Switch by setting STORAGE_PROVIDER env variable.
 */

export interface PutOptions {
  contentType?: string;
  isPrivate?: boolean;
}

export interface StorageProvider {
  /** Store a file. Returns the object key. */
  put(key: string, data: Buffer, options?: PutOptions): Promise<string>;

  /** Retrieve a file as a Buffer. */
  get(key: string): Promise<Buffer>;

  /** Delete a file. */
  delete(key: string): Promise<void>;

  /** Generate a temporary signed URL for private access. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

// ── Provider Factory ─────────────────────────────────────────────────────────

let _provider: StorageProvider | null = null;

export async function getStorageProvider(): Promise<StorageProvider> {
  if (_provider) return _provider;

  const providerName = process.env.STORAGE_PROVIDER ?? "local";

  if (providerName === "local") {
    const { LocalStorageProvider } = await import("./local");
    _provider = new LocalStorageProvider();
  } else if (providerName === "s3") {
    // S3 adapter — Phase 7 / production
    throw new Error(
      "S3 storage provider not yet implemented. Set STORAGE_PROVIDER=local for development."
    );
  } else {
    throw new Error(`Unknown STORAGE_PROVIDER: ${providerName}`);
  }

  return _provider;
}

// ── Convenience helpers ──────────────────────────────────────────────────────

export async function storeFile(key: string, data: Buffer, options?: PutOptions): Promise<string> {
  const provider = await getStorageProvider();
  return provider.put(key, data, options);
}

export async function getFile(key: string): Promise<Buffer> {
  const provider = await getStorageProvider();
  return provider.get(key);
}

export async function deleteFile(key: string): Promise<void> {
  const provider = await getStorageProvider();
  return provider.delete(key);
}

export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const provider = await getStorageProvider();
  return provider.getSignedUrl(key, expiresInSeconds);
}
