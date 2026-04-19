import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { LocalStorageProvider } from '../local-provider';

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    vi.stubEnv('STORAGE_LOCAL_PATH', tmpDir);
    provider = new LocalStorageProvider();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('should write file to the correct path', async () => {
      const content = Buffer.from('hello world');
      await provider.upload('org-1/file.txt', content);

      const written = await fs.readFile(path.join(tmpDir, 'org-1/file.txt'));
      expect(written).toEqual(content);
    });

    it('should create nested directories as needed', async () => {
      const content = Buffer.from('thumbnail data');
      await provider.upload('org-1/thumbnails/file.png', content);

      const written = await fs.readFile(
        path.join(tmpDir, 'org-1/thumbnails/file.png'),
      );
      expect(written).toEqual(content);
    });

    it('should overwrite existing file', async () => {
      await provider.upload('org-1/file.txt', Buffer.from('v1'));
      await provider.upload('org-1/file.txt', Buffer.from('v2'));

      const written = await fs.readFile(path.join(tmpDir, 'org-1/file.txt'));
      expect(written.toString()).toBe('v2');
    });
  });

  describe('download', () => {
    it('should read file content as Buffer', async () => {
      const content = Buffer.from('test content');
      const filePath = path.join(tmpDir, 'org-1/file.txt');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);

      const result = await provider.download('org-1/file.txt');
      expect(result).toEqual(content);
    });

    it('should throw when file does not exist', async () => {
      await expect(
        provider.download('org-1/nonexistent.txt'),
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should remove the file', async () => {
      const filePath = path.join(tmpDir, 'org-1/file.txt');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'data');

      await provider.delete('org-1/file.txt');

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('should succeed when file does not exist (idempotent)', async () => {
      await expect(
        provider.delete('org-1/nonexistent.txt'),
      ).resolves.toBeUndefined();
    });
  });

  describe('path traversal protection', () => {
    it('should reject relative traversal keys', async () => {
      const content = Buffer.from('data');
      await expect(provider.upload('../outside.txt', content)).rejects.toThrow(
        'path traversal',
      );
      await expect(provider.download('../outside.txt')).rejects.toThrow(
        'path traversal',
      );
      await expect(provider.delete('../outside.txt')).rejects.toThrow(
        'path traversal',
      );
    });

    it('should reject absolute path keys', async () => {
      const content = Buffer.from('data');
      await expect(provider.upload('/etc/passwd', content)).rejects.toThrow(
        'path traversal',
      );
      await expect(provider.download('/etc/passwd')).rejects.toThrow(
        'path traversal',
      );
      await expect(provider.delete('/etc/passwd')).rejects.toThrow(
        'path traversal',
      );
    });
  });
});
