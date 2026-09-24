import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StorageNotFoundError } from '../errors';

/**
 * The S3 provider against a real S3-compatible store — RustFS, from compose's
 * `s3` profile. The unit suite beside this mocks the SDK, so it cannot tell
 * whether a store accepts our addressing style, our multipart upload or our
 * error mapping; this can.
 *
 * Skipped unless S3_INTEGRATION_ENDPOINT is set, so `npm test` never needs a
 * container. To run it:
 *
 *   docker compose --profile s3 up -d rustfs-bucket-init
 *   S3_INTEGRATION_ENDPOINT=http://localhost:59000 npx vitest run \
 *     packages/storage/src/__tests__/s3-provider.integration.test.ts
 *
 * The keys default to the compose file's local-trial ones.
 */
const endpoint = process.env.S3_INTEGRATION_ENDPOINT;

describe.skipIf(!endpoint)('S3StorageProvider against RustFS', () => {
  const saved: Record<string, string | undefined> = {};
  const vars = {
    S3_ENDPOINT_URL: endpoint,
    S3_FORCE_PATH_STYLE: 'true',
    S3_REGION: 'us-east-1',
    S3_BUCKET_NAME: process.env.S3_INTEGRATION_BUCKET ?? 'ragen',
    S3_ACCESS_KEY_ID: process.env.RUSTFS_ACCESS_KEY ?? 'ragen-local',
    S3_SECRET_ACCESS_KEY: process.env.RUSTFS_SECRET_KEY ?? 'ragen-local-secret',
  };
  // One prefix per run, so a rerun never reads what an earlier one left.
  const prefix = `integration/${randomUUID()}`;
  let provider: import('../s3-provider').S3StorageProvider;
  let tmpDir: string;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(vars)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    // Imported after the environment is set: the client reads it once.
    const { S3StorageProvider } = await import('../s3-provider');
    provider = new S3StorageProvider();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ragen-s3-it-'));
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('stores a document and gives back the same bytes', async () => {
    const key = `${prefix}/umowa.pdf`;
    const content = Buffer.from('%PDF-1.7\nzażółć gęślą jaźń\n');
    await provider.upload(key, content);
    await expect(provider.download(key)).resolves.toEqual(content);
  });

  it('streams an object larger than one multipart part to a file', async () => {
    // 6 MiB: over the SDK's 5 MiB part size, so the upload goes multipart —
    // the path a real PDF takes and the one most likely to differ between
    // stores.
    const key = `${prefix}/large.bin`;
    const content = Buffer.alloc(6 * 1024 * 1024, 7);
    await provider.upload(key, content);
    const dest = path.join(tmpDir, 'large.bin');
    await provider.downloadToFile(key, dest);
    const written = await fs.readFile(dest);
    expect(written.length).toBe(content.length);
    expect(written.equals(content)).toBe(true);
  });

  it('reports a missing key as StorageNotFoundError, not a 500', async () => {
    await expect(
      provider.download(`${prefix}/never-written.txt`),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it('deletes, after which the key is missing', async () => {
    const key = `${prefix}/to-delete.txt`;
    await provider.upload(key, Buffer.from('bye'));
    await provider.delete(key);
    await expect(provider.download(key)).rejects.toBeInstanceOf(
      StorageNotFoundError,
    );
  });
});
