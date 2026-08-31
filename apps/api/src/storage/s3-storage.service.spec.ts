import { NotFoundException } from '@nestjs/common';

const mockUpload = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockDownloadToFile = jest.fn();
const mockGetStorageProvider = jest.fn();

class FakeStorageNotFoundError extends Error {
  constructor(key: string) {
    super(`No content found for key: ${key}`);
    this.name = 'StorageNotFoundError';
  }
}

jest.mock('@ragenai/storage', () => ({
  getStorageProvider: (...args: unknown[]) => mockGetStorageProvider(...args),
  StorageNotFoundError: FakeStorageNotFoundError,
}));

import { S3StorageService } from './s3-storage.service.js';

describe('S3StorageService', () => {
  let service: S3StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStorageProvider.mockReturnValue({
      upload: mockUpload,
      download: mockDownload,
      delete: mockDelete,
      downloadToFile: mockDownloadToFile,
    });
    service = new S3StorageService();
  });

  // ADR-27: apps/api no longer carries its own S3 implementation. It binds the
  // shared provider and translates that package's error into Nest's, which is
  // the part with user-visible consequences.
  it('resolves its provider from the shared package', () => {
    expect(mockGetStorageProvider).toHaveBeenCalledTimes(1);
    // The warn callback is passed so the local-in-production warning reaches
    // Nest's logger rather than bare stdout.
    expect(typeof mockGetStorageProvider.mock.calls[0][0]).toBe('function');
  });

  describe('upload', () => {
    it('delegates to the provider', async () => {
      mockUpload.mockResolvedValue(undefined);

      await service.upload('org-1/file.txt', Buffer.from('hello'));

      expect(mockUpload).toHaveBeenCalledWith(
        'org-1/file.txt',
        Buffer.from('hello'),
      );
    });
  });

  describe('download', () => {
    it('returns the provider’s buffer', async () => {
      mockDownload.mockResolvedValue(Buffer.from('hello'));

      await expect(service.download('org-1/file.txt')).resolves.toEqual(
        Buffer.from('hello'),
      );
    });

    // Load-bearing: Nest maps its own NotFoundException to HTTP 404. Letting
    // StorageNotFoundError escape would turn a 404 into a 500.
    it('translates StorageNotFoundError into NotFoundException', async () => {
      mockDownload.mockRejectedValue(
        new FakeStorageNotFoundError('org-1/file.txt'),
      );

      await expect(service.download('org-1/file.txt')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.download('org-1/file.txt')).rejects.toThrow(
        'No content found for key: org-1/file.txt',
      );
    });

    it('lets any other error through untouched', async () => {
      const boom = new Error('network down');
      mockDownload.mockRejectedValue(boom);

      await expect(service.download('org-1/file.txt')).rejects.toBe(boom);
    });
  });

  describe('delete', () => {
    it('delegates to the provider', async () => {
      mockDelete.mockResolvedValue(undefined);

      await service.delete('org-1/file.txt');

      expect(mockDelete).toHaveBeenCalledWith('org-1/file.txt');
    });
  });

  describe('downloadToFile', () => {
    it('delegates to the provider', async () => {
      mockDownloadToFile.mockResolvedValue(undefined);

      await service.downloadToFile('org-1/doc.pdf', '/tmp/doc.pdf');

      expect(mockDownloadToFile).toHaveBeenCalledWith(
        'org-1/doc.pdf',
        '/tmp/doc.pdf',
      );
    });

    it('translates StorageNotFoundError into NotFoundException', async () => {
      mockDownloadToFile.mockRejectedValue(
        new FakeStorageNotFoundError('org-1/missing.pdf'),
      );

      await expect(
        service.downloadToFile('org-1/missing.pdf', '/tmp/x.pdf'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
