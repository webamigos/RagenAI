import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { LocalStorageProvider, resolveBasePath } from '../local-provider';
import { StorageNotFoundError } from '../errors';

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
    it('writes the file to the correct path', async () => {
      const content = Buffer.from('hello world');
      await provider.upload('org-1/file.txt', content);

      expect(await fs.readFile(path.join(tmpDir, 'org-1/file.txt'))).toEqual(
        content,
      );
    });

    it('creates nested directories as needed', async () => {
      const content = Buffer.from('thumbnail data');
      await provider.upload('org-1/thumbnails/file.png', content);

      expect(
        await fs.readFile(path.join(tmpDir, 'org-1/thumbnails/file.png')),
      ).toEqual(content);
    });

    it('overwrites an existing file', async () => {
      await provider.upload('org-1/file.txt', Buffer.from('v1'));
      await provider.upload('org-1/file.txt', Buffer.from('v2'));

      const written = await fs.readFile(path.join(tmpDir, 'org-1/file.txt'));
      expect(written.toString()).toBe('v2');
    });
  });

  describe('download', () => {
    it('reads file content as a Buffer', async () => {
      const content = Buffer.from('test content');
      const filePath = path.join(tmpDir, 'org-1/file.txt');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);

      expect(await provider.download('org-1/file.txt')).toEqual(content);
    });

    // The worker's copy used to let a raw ENOENT escape here; ADR-27 keeps
    // apps/web's domain error so every caller sees one shape.
    it('throws StorageNotFoundError when the file does not exist', async () => {
      await expect(provider.download('org-1/nonexistent.txt')).rejects.toThrow(
        StorageNotFoundError,
      );
    });
  });

  describe('delete', () => {
    it('removes the file', async () => {
      const filePath = path.join(tmpDir, 'org-1/file.txt');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'data');

      await provider.delete('org-1/file.txt');

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('is idempotent when the file does not exist', async () => {
      await expect(
        provider.delete('org-1/nonexistent.txt'),
      ).resolves.toBeUndefined();
    });
  });

  describe('downloadToFile', () => {
    it('copies the object to the destination, creating parent dirs', async () => {
      const filePath = path.join(tmpDir, 'org-1/doc.pdf');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from('pdf bytes'));

      const dest = path.join(tmpDir, 'nested/out/doc.pdf');
      await provider.downloadToFile('org-1/doc.pdf', dest);

      expect((await fs.readFile(dest)).toString()).toBe('pdf bytes');
    });

    // Copies via a temp file + rename (matching s3-provider), so a copy that
    // never completes must never leave a `.download-*.tmp` file, or destPath
    // itself, behind in the destination directory.
    it('leaves no temp file behind in the destination directory on success', async () => {
      const filePath = path.join(tmpDir, 'org-1/doc.pdf');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from('pdf bytes'));

      const destDir = path.join(tmpDir, 'out');
      await provider.downloadToFile(
        'org-1/doc.pdf',
        path.join(destDir, 'doc.pdf'),
      );

      expect(await fs.readdir(destDir)).toEqual(['doc.pdf']);
    });

    it('throws StorageNotFoundError for a missing object, leaving destPath and any temp file absent', async () => {
      const destDir = path.join(tmpDir, 'out');
      await fs.mkdir(destDir, { recursive: true });

      await expect(
        provider.downloadToFile(
          'org-1/missing.pdf',
          path.join(destDir, 'o.pdf'),
        ),
      ).rejects.toThrow(StorageNotFoundError);

      expect(await fs.readdir(destDir)).toEqual([]);
    });
  });

  describe('path traversal protection', () => {
    it('rejects relative traversal keys on every operation', async () => {
      await expect(
        provider.upload('../outside.txt', Buffer.from('data')),
      ).rejects.toThrow('path traversal');
      await expect(provider.download('../outside.txt')).rejects.toThrow(
        'path traversal',
      );
      await expect(provider.delete('../outside.txt')).rejects.toThrow(
        'path traversal',
      );
      await expect(
        provider.downloadToFile('../outside.txt', '/tmp/x'),
      ).rejects.toThrow('path traversal');
    });

    it('rejects absolute path keys on every operation', async () => {
      await expect(
        provider.upload('/etc/passwd', Buffer.from('data')),
      ).rejects.toThrow('path traversal');
      await expect(provider.download('/etc/passwd')).rejects.toThrow(
        'path traversal',
      );
      await expect(provider.delete('/etc/passwd')).rejects.toThrow(
        'path traversal',
      );
    });

    it('rejects a traversal segment buried mid-key', async () => {
      await expect(
        provider.upload('org-1/../../escape.txt', Buffer.from('data')),
      ).rejects.toThrow('path traversal');
    });

    it('allows a key that merely starts with the base path name', async () => {
      await provider.upload('org-1/ok.txt', Buffer.from('fine'));
      expect((await provider.download('org-1/ok.txt')).toString()).toBe('fine');
    });
  });

  // The bug this guards against: the app runs from the repo root and the worker
  // from apps/worker, so a cwd-relative default sent them to different
  // directories and every ingest failed to find its own upload.
  describe('base path anchoring', () => {
    it('anchors a relative path to the workspace root, not the cwd', () => {
      vi.stubEnv('npm_config_local_prefix', '/repo');
      expect(resolveBasePath('./data/storage')).toBe(
        path.join('/repo', 'data/storage'),
      );
    });

    it('resolves identically from the app cwd and the worker cwd', () => {
      vi.stubEnv('npm_config_local_prefix', '/repo');
      // Actually vary the cwd — the whole bug was that these two differed.
      const cwd = vi.spyOn(process, 'cwd');

      cwd.mockReturnValue('/repo');
      const fromRoot = resolveBasePath('./data/storage');

      cwd.mockReturnValue('/repo/apps/worker');
      const fromWorker = resolveBasePath('./data/storage');

      cwd.mockRestore();
      expect(fromWorker).toBe(fromRoot);
      expect(fromRoot).toBe(path.join('/repo', 'data/storage'));
    });

    it('strips a trailing separator from an absolute base', () => {
      // Left in place it breaks resolvePath's containment check, rejecting
      // every valid key.
      expect(resolveBasePath('/mnt/shared/')).toBe('/mnt/shared');
    });

    it('accepts keys under an absolute base written with a trailing separator', async () => {
      const withSlash = new LocalStorageProvider(`${tmpDir}/`);
      await withSlash.upload('org-1/file.txt', Buffer.from('ok'));
      expect((await withSlash.download('org-1/file.txt')).toString()).toBe(
        'ok',
      );
    });

    it('leaves an absolute path alone', () => {
      vi.stubEnv('npm_config_local_prefix', '/repo');
      expect(resolveBasePath('/mnt/shared')).toBe('/mnt/shared');
    });

    it('falls back to cwd when npm did not set the workspace root', () => {
      vi.stubEnv('npm_config_local_prefix', '');
      expect(resolveBasePath('./data/storage')).toBe(
        path.resolve(process.cwd(), './data/storage'),
      );
    });
  });

  describe('default base path', () => {
    it('falls back to ./data/storage when STORAGE_LOCAL_PATH is unset', async () => {
      vi.stubEnv('STORAGE_LOCAL_PATH', '');
      // apps/web's copy used a non-null assertion here and threw on construction.
      expect(() => new LocalStorageProvider()).not.toThrow();
    });
  });
});
