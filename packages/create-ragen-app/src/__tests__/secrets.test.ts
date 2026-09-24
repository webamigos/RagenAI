import { describe, expect, it } from 'vitest';

import {
  generateS3AccessKeyId,
  generateS3SecretAccessKey,
  generateSecret,
} from '../secrets';

describe('generateSecret', () => {
  it('returns a 64-character hex string (32 bytes)', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat across calls', () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateSecret()));
    expect(secrets.size).toBe(20);
  });
});

describe('S3 credentials for a self-hosted store', () => {
  it('makes a 20-character upper-case hex access key id', () => {
    // MinIO accepts 3–20 characters, and RustFS follows it; 64 would be
    // refused and the store would not start.
    expect(generateS3AccessKeyId()).toMatch(/^[0-9A-F]{20}$/);
  });

  it('makes a 40-character hex secret', () => {
    expect(generateS3SecretAccessKey()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('does not repeat across calls', () => {
    const ids = new Set(Array.from({ length: 20 }, generateS3AccessKeyId));
    const secrets = new Set(
      Array.from({ length: 20 }, generateS3SecretAccessKey),
    );
    expect(ids.size).toBe(20);
    expect(secrets.size).toBe(20);
  });
});
