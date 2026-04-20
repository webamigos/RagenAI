import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getStorageProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('should return S3StorageProvider by default', async () => {
    vi.stubEnv('AWS_S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('AWS_DEFAULT_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');

    const { getStorageProvider } = await import('../index');
    const provider = getStorageProvider();

    expect(provider.constructor.name).toBe('S3StorageProvider');
  });

  it('should return S3StorageProvider when STORAGE_PROVIDER=s3', async () => {
    vi.stubEnv('STORAGE_PROVIDER', 's3');
    vi.stubEnv('AWS_S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('AWS_DEFAULT_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');

    const { getStorageProvider } = await import('../index');
    const provider = getStorageProvider();

    expect(provider.constructor.name).toBe('S3StorageProvider');
  });

  it('should return LocalStorageProvider when STORAGE_PROVIDER=local', async () => {
    vi.stubEnv('STORAGE_PROVIDER', 'local');
    vi.stubEnv('STORAGE_LOCAL_PATH', '/tmp/test-storage');

    const { getStorageProvider } = await import('../index');
    const provider = getStorageProvider();

    expect(provider.constructor.name).toBe('LocalStorageProvider');
  });

  it('should throw for unknown provider', async () => {
    vi.stubEnv('STORAGE_PROVIDER', 'gcs');

    const { getStorageProvider } = await import('../index');

    expect(() => getStorageProvider()).toThrow(
      'Unknown STORAGE_PROVIDER: "gcs"',
    );
  });

  it('should return the same instance on subsequent calls', async () => {
    vi.stubEnv('STORAGE_PROVIDER', 'local');
    vi.stubEnv('STORAGE_LOCAL_PATH', '/tmp/test-storage');

    const { getStorageProvider } = await import('../index');
    const first = getStorageProvider();
    const second = getStorageProvider();

    expect(first).toBe(second);
  });
});
