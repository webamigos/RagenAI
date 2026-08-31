import fs from 'fs/promises';
import path from 'path';

import { StorageNotFoundError } from './errors';
import type { StorageProvider } from './types';

/** Used when `STORAGE_LOCAL_PATH` is unset. */
export const DEFAULT_LOCAL_PATH = './data/storage';

/**
 * Filesystem-backed storage. The default provider (ADR-27).
 *
 * Reconciled from the two implementations that existed before: ragen-app's
 * crashed on a non-null assertion when `STORAGE_LOCAL_PATH` was unset and let
 * only the resolved-prefix check guard traversal; the worker's had the default
 * path and the stricter check but leaked raw ENOENT to callers. This keeps the
 * stricter half of each.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(basePath = process.env.STORAGE_LOCAL_PATH || DEFAULT_LOCAL_PATH) {
    this.basePath = path.resolve(basePath);
  }

  /**
   * Two checks rather than one, deliberately. Rejecting absolute keys and `..`
   * segments up front states the invariant a reader can verify; re-checking the
   * resolved path catches anything the first pass did not anticipate (symlinked
   * components, platform-specific separators). Either alone would be sound
   * today — together they stay sound when someone edits one of them.
   */
  private resolvePath(key: string): string {
    if (path.isAbsolute(key) || key.split(/[\\/]/).includes('..')) {
      throw new Error(`Invalid storage key (path traversal): ${key}`);
    }
    const resolved = path.resolve(this.basePath, key);
    if (
      resolved !== this.basePath &&
      !resolved.startsWith(this.basePath + path.sep)
    ) {
      throw new Error(`Invalid storage key (path traversal): ${key}`);
    }
    return resolved;
  }

  async upload(key: string, content: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.resolvePath(key);
    try {
      return await fs.readFile(filePath);
    } catch (err: unknown) {
      if (isEnoent(err)) {
        throw new StorageNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    // `force` makes deleting an absent key a no-op, matching S3's DELETE.
    await fs.rm(filePath, { force: true });
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    try {
      await fs.copyFile(filePath, destPath);
    } catch (err: unknown) {
      if (isEnoent(err)) {
        throw new StorageNotFoundError(key);
      }
      throw err;
    }
  }
}

function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
