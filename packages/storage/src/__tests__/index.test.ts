import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  getStorageProvider,
  resetStorageProvider,
  resolveStorageProviderName,
} from '../index';

describe('getStorageProvider', () => {
  beforeEach(() => {
    resetStorageProvider();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetStorageProvider();
    vi.unstubAllEnvs();
  });

  // The headline behaviour change of ADR-27. Ragen is self-hosted software, so
  // a fresh clone has to run without a cloud account; S3 is now opt-in.
  it('defaults to local storage when STORAGE_PROVIDER is unset', () => {
    expect(getStorageProvider().constructor.name).toBe('LocalStorageProvider');
  });

  it('treats a blank STORAGE_PROVIDER as unset', () => {
    vi.stubEnv('STORAGE_PROVIDER', '   ');
    expect(getStorageProvider().constructor.name).toBe('LocalStorageProvider');
  });

  it('returns S3StorageProvider when STORAGE_PROVIDER=s3', () => {
    vi.stubEnv('STORAGE_PROVIDER', 's3');
    vi.stubEnv('S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret');

    expect(getStorageProvider().constructor.name).toBe('S3StorageProvider');
  });

  it('throws for an unknown provider', () => {
    vi.stubEnv('STORAGE_PROVIDER', 'gcs');
    expect(() => getStorageProvider()).toThrow(
      'Unknown STORAGE_PROVIDER: "gcs"',
    );
  });

  it('memoizes the instance', () => {
    vi.stubEnv('STORAGE_PROVIDER', 'local');
    expect(getStorageProvider()).toBe(getStorageProvider());
  });
});

describe('local-in-production warning', () => {
  beforeEach(() => {
    resetStorageProvider();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetStorageProvider();
    vi.unstubAllEnvs();
  });

  it.each(['production', 'staging', 'demo'])(
    'warns when local storage is used with TARGET_ENV=%s',
    (env) => {
      vi.stubEnv('STORAGE_PROVIDER', 'local');
      vi.stubEnv('TARGET_ENV', env);
      const warn = vi.fn();

      getStorageProvider(warn);

      expect(warn).toHaveBeenCalledTimes(1);
      // The warning has to name the failure mode, not just disapprove: app and
      // worker are separate containers and need one shared volume.
      const message = warn.mock.calls[0][0] as string;
      expect(message).toContain('SAME persistent');
      expect(message).toContain('separate containers');
      expect(message).toContain('STORAGE_PROVIDER=s3');
    },
  );

  it('does not warn for local storage outside production', () => {
    vi.stubEnv('STORAGE_PROVIDER', 'local');
    vi.stubEnv('TARGET_ENV', 'local');
    const warn = vi.fn();

    getStorageProvider(warn);

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when production uses s3', () => {
    vi.stubEnv('STORAGE_PROVIDER', 's3');
    vi.stubEnv('TARGET_ENV', 'production');
    vi.stubEnv('S3_BUCKET_NAME', 'b');
    vi.stubEnv('S3_REGION', 'r');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'k');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 's');
    const warn = vi.fn();

    getStorageProvider(warn);

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when production relies on the new local default', () => {
    vi.stubEnv('TARGET_ENV', 'production');
    const warn = vi.fn();

    getStorageProvider(warn);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveStorageProviderName', () => {
  it('accepts the two supported names', () => {
    expect(resolveStorageProviderName('s3')).toBe('s3');
    expect(resolveStorageProviderName('local')).toBe('local');
  });

  it('defaults to local', () => {
    expect(resolveStorageProviderName(undefined)).toBe('local');
  });
});
