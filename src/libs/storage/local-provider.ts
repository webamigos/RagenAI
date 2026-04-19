import fs from 'fs/promises';
import path from 'path';
import { NotFoundException } from '@/libs/utils/errors';
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
    try {
      return await fs.readFile(filePath);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        throw new NotFoundException(`No content found for key: ${key}`);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.rm(filePath, { force: true });
  }
}
