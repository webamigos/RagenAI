import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
const mockUploadDone = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: vi.fn().mockImplementation((params) => ({
    _type: 'GetObject',
    ...params,
  })),
  DeleteObjectCommand: vi.fn().mockImplementation((params) => ({
    _type: 'DeleteObject',
    ...params,
  })),
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(() => ({ done: mockUploadDone })),
}));

import { S3StorageProvider } from '../s3-provider';
import { Upload } from '@aws-sdk/lib-storage';
import { NotFoundException } from '@/libs/utils/errors';

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;

  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('AWS_DEFAULT_REGION', 'us-east-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');
    mockSend.mockReset();
    mockUploadDone.mockReset();
    provider = new S3StorageProvider();
  });

  describe('upload', () => {
    it('should create Upload with correct params', async () => {
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
    it('should return buffer from response body', async () => {
      const bodyBytes = new Uint8Array([104, 101, 108, 108, 111]);
      mockSend.mockResolvedValue({
        Body: {
          transformToByteArray: vi.fn().mockResolvedValue(bodyBytes),
        },
      });

      const result = await provider.download('org-1/file.txt');

      expect(result).toEqual(Buffer.from('hello'));
    });

    it('should throw NotFoundException when body is missing', async () => {
      mockSend.mockResolvedValue({ Body: undefined });

      await expect(provider.download('org-1/file.txt')).rejects.toThrow(
        NotFoundException,
      );
      await expect(provider.download('org-1/file.txt')).rejects.toThrow(
        'No content found for key: org-1/file.txt',
      );
    });
  });

  describe('delete', () => {
    it('should send DeleteObjectCommand with correct params', async () => {
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
});
