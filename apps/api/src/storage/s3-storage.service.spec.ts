import { NotFoundException } from '@nestjs/common';
import * as storage from '@ragenai/storage';

const mockUpload = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockDownloadToFile = jest.fn();

// The class lives inside the factory: jest.mock is hoisted above the module
// body, so a class declared outside is still in its temporal dead zone when the
// factory runs ("Cannot access ... before initialization").
jest.mock('@ragenai/storage', () => {
  class MockStorageNotFoundError extends Error {
    constructor(key: string) {
      super(`No content found for key: ${key}`);
      this.name = 'StorageNotFoundError';
    }
  }
  return {
    getStorageProvider: jest.fn(),
    StorageNotFoundError: MockStorageNotFoundError,
  };
});

// jest.mocked() derives the signature from the real module, so the mock stays
// typed — apps/api's ESLint enables no-unsafe-return/-member-access, which a
// bare jest.fn() (typed `any`) trips.
const getStorageProviderMock = jest.mocked(storage.getStorageProvider);

import { S3StorageService } from './s3-storage.service.js';

describe('S3StorageService', () => {
  let service: S3StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    getStorageProviderMock.mockReturnValue({
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
    expect(getStorageProviderMock).toHaveBeenCalledTimes(1);
    // The warn callback is passed so the local-in-production warning reaches
    // Nest's logger rather than bare stdout.
    expect(getStorageProviderMock).toHaveBeenCalledWith(expect.any(Function));
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
        new storage.StorageNotFoundError('org-1/file.txt'),
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
        new storage.StorageNotFoundError('org-1/missing.pdf'),
      );

      await expect(
        service.downloadToFile('org-1/missing.pdf', '/tmp/x.pdf'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
