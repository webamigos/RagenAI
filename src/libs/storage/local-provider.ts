import fs from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './types';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(process.env.STORAGE_LOCAL_PATH!);
  }

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.basePath, key);
    if (
      !resolved.startsWith(this.basePath + path.sep) &&
      resolved !== this.basePath
    ) {
      throw new Error(`Invalid storage key: path traversal detected`);
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
    await fs.rm(filePath, { force: true });
  }
}
