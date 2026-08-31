import { NotFoundException } from '@nestjs/common';

const mockSend = jest.fn();
const mockUploadDone = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((params: object) => ({
    _type: 'GetObject',
    ...params,
  })),
  DeleteObjectCommand: jest.fn().mockImplementation((params: object) => ({
    _type: 'DeleteObject',
    ...params,
  })),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({ done: mockUploadDone })),
}));

import { Upload } from '@aws-sdk/lib-storage';
import { S3StorageService } from './s3-storage.service.js';

const UploadMock = Upload as unknown as jest.Mock;

describe('S3StorageService', () => {
  let service: S3StorageService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    mockSend.mockReset();
    mockUploadDone.mockReset();
    UploadMock.mockClear();
    service = new S3StorageService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('upload', () => {
    it('creates an Upload with the correct params', async () => {
      mockUploadDone.mockResolvedValue(undefined);

      await service.upload('org-1/file.txt', Buffer.from('hello'));

      expect(UploadMock).toHaveBeenCalledWith(
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
    it('returns a buffer from the response body', async () => {
      const bodyBytes = new Uint8Array([104, 101, 108, 108, 111]);
      mockSend.mockResolvedValue({
        Body: { transformToByteArray: jest.fn().mockResolvedValue(bodyBytes) },
      });

      const result = await service.download('org-1/file.txt');

      expect(result).toEqual(Buffer.from('hello'));
    });

    it('throws NotFoundException when the body is missing', async () => {
      mockSend.mockResolvedValue({ Body: undefined });

      await expect(service.download('org-1/file.txt')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('sends a DeleteObjectCommand with the correct params', async () => {
      mockSend.mockResolvedValue({});

      await service.delete('org-1/file.txt');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'org-1/file.txt',
        }),
      );
    });
  });
});
