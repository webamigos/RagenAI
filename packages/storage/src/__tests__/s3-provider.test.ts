import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.fn();
const mockUploadDone = vi.fn();
const mockS3ClientCtor = vi.fn();

// These are all invoked with `new`. Vitest 4 constructs the mock's own
// implementation, and an arrow function is not a constructor — hence the
// `function` expressions rather than the arrows this used before.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function (config: unknown) {
    mockS3ClientCtor(config);
    return { send: mockSend };
  }),
  GetObjectCommand: vi.fn(function (params: Record<string, unknown>) {
    return { _type: 'GetObject', ...params };
  }),
  DeleteObjectCommand: vi.fn(function (params: Record<string, unknown>) {
    return { _type: 'DeleteObject', ...params };
  }),
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn(function () {
    return { done: mockUploadDone };
  }),
}));

import { Upload } from '@aws-sdk/lib-storage';
import { S3StorageProvider } from '../s3-provider';
import { StorageNotFoundError } from '../errors';

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;

  beforeEach(() => {
    vi.stubEnv('S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret');
    mockSend.mockReset();
    mockUploadDone.mockReset();
    mockS3ClientCtor.mockReset();
    provider = new S3StorageProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('upload', () => {
    it('creates an Upload with the right params', async () => {
      mockUploadDone.mockResolvedValue(undefined);

      await provider.upload('org-1/file.txt', Buffer.from('hello'));

      expect(Upload).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            Bucket: 'test-bucket',
            Key: 'org-1/file.txt',
            Body: Buffer.from('hello'),
          },
        }),
      );
      expect(mockUploadDone).toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('returns a Buffer from the response body', async () => {
      mockSend.mockResolvedValue({
        Body: {
          transformToByteArray: vi
            .fn()
            .mockResolvedValue(new Uint8Array([104, 101, 108, 108, 111])),
        },
      });

      expect(await provider.download('org-1/file.txt')).toEqual(
        Buffer.from('hello'),
      );
    });

    // S3 signals a missing object by rejecting, not by returning an empty body,
    // so this path — not the !Body check — is what a real 404 hits.
    it.each([
      [
        'NoSuchKey by name',
        Object.assign(new Error('nope'), { name: 'NoSuchKey' }),
      ],
      [
        'NotFound by name',
        Object.assign(new Error('nope'), { name: 'NotFound' }),
      ],
      [
        '404 in $metadata',
        Object.assign(new Error('nope'), {
          $metadata: { httpStatusCode: 404 },
        }),
      ],
    ])(
      'normalizes a rejected %s into StorageNotFoundError',
      async (_label, err) => {
        mockSend.mockRejectedValue(err);

        await expect(provider.download('org-1/file.txt')).rejects.toThrow(
          StorageNotFoundError,
        );
      },
    );

    it('lets other AWS errors through untouched', async () => {
      const boom = Object.assign(new Error('access denied'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      });
      mockSend.mockRejectedValue(boom);

      await expect(provider.download('org-1/file.txt')).rejects.toBe(boom);
    });

    it('throws StorageNotFoundError when the body is missing', async () => {
      mockSend.mockResolvedValue({ Body: undefined });

      await expect(provider.download('org-1/file.txt')).rejects.toThrow(
        StorageNotFoundError,
      );
      await expect(provider.download('org-1/file.txt')).rejects.toThrow(
        'No content found for key: org-1/file.txt',
      );
    });
  });

  describe('downloadToFile', () => {
    it('normalizes a rejected NoSuchKey into StorageNotFoundError', async () => {
      mockSend.mockRejectedValue(
        Object.assign(new Error('nope'), { name: 'NoSuchKey' }),
      );

      await expect(
        provider.downloadToFile('org-1/missing.pdf', '/tmp/x.pdf'),
      ).rejects.toThrow(StorageNotFoundError);
    });
  });

  describe('delete', () => {
    it('sends DeleteObjectCommand with the right params', async () => {
      mockSend.mockResolvedValue({});

      await provider.delete('org-1/file.txt');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'org-1/file.txt',
        }),
      );
    });
  });

  // apps/web's copy compared AWS_S3_FORCE_PATH_STYLE against '1' only, so
  // `true` silently did nothing there — and a wrong addressing style surfaces as
  // TLS or 404 errors that look nothing like a config typo (ADR-27).
  describe('S3-compatible endpoint configuration', () => {
    it.each(['1', 'true', 'TRUE', 'yes'])(
      'enables path-style addressing for S3_FORCE_PATH_STYLE=%s',
      (value) => {
        vi.stubEnv('S3_FORCE_PATH_STYLE', value);
        new S3StorageProvider();
        expect(mockS3ClientCtor).toHaveBeenLastCalledWith(
          expect.objectContaining({ forcePathStyle: true }),
        );
      },
    );

    it.each(['0', 'false', '', 'no'])(
      'leaves path-style addressing off for S3_FORCE_PATH_STYLE=%s',
      (value) => {
        vi.stubEnv('S3_FORCE_PATH_STYLE', value);
        new S3StorageProvider();
        expect(mockS3ClientCtor).toHaveBeenLastCalledWith(
          expect.objectContaining({ forcePathStyle: false }),
        );
      },
    );

    it('passes a custom endpoint through, so R2/MinIO/Scaleway work', () => {
      vi.stubEnv('S3_ENDPOINT_URL', 'https://account.r2.cloudflarestorage.com');
      new S3StorageProvider();
      expect(mockS3ClientCtor).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: 'https://account.r2.cloudflarestorage.com',
        }),
      );
    });

    it('forwards S3_SESSION_TOKEN for temporary credentials', () => {
      vi.stubEnv('S3_SESSION_TOKEN', 'session-token');
      new S3StorageProvider();
      expect(mockS3ClientCtor).toHaveBeenLastCalledWith(
        expect.objectContaining({
          credentials: expect.objectContaining({
            sessionToken: 'session-token',
          }),
        }),
      );
    });
  });
});
