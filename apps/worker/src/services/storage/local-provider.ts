import fs from 'fs/promises';
import { copyFile } from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './types';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private resolvedBase: string;

  constructor() {
    this.basePath = process.env.STORAGE_LOCAL_PATH || './data/storage';
    this.resolvedBase = path.resolve(this.basePath);
  }

  private resolvePath(key: string): string {
    if (path.isAbsolute(key) || key.split(/[\\/]/).includes('..')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const resolved = path.resolve(this.resolvedBase, key);
    if (
      resolved !== this.resolvedBase &&
      !resolved.startsWith(this.resolvedBase + path.sep)
    ) {
      throw new Error(`Invalid storage key: ${key}`);
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
    return await fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const filePath = this.resolvePath(key);
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });
    await copyFile(filePath, destPath);
  }
}
