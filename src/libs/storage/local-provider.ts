import fs from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './types';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = process.env.STORAGE_LOCAL_PATH || './data/storage';
  }

  private resolvePath(key: string): string {
    return path.join(this.basePath, key);
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
    await fs.unlink(filePath);
  }
}
