import { DeleteFileService } from './delete-file.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService } from './files.service.js';
import { DeleteFileFromVectorStoreService } from './delete-file-from-vector-store.service.js';
import { S3StorageService } from '../storage/s3-storage.service.js';

describe('DeleteFileService', () => {
  let findFirst: jest.Mock;
  let filesService: {
    deleteFileFromDb: jest.Mock;
    deleteDocumentFromDb: jest.Mock;
  };
  let deleteFromVectorStore: { delete: jest.Mock };
  let s3: { delete: jest.Mock };
  let service: DeleteFileService;

  const fileRecord = {
    id: 'file-1',
    fileName: 'report.pdf',
    thumbnailS3Key: null as string | null,
    documentId: null as string | null,
  };

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue(fileRecord);
    const prisma = {
      client: { userFile: { findFirst } },
    } as unknown as PrismaService;

    filesService = {
      deleteFileFromDb: jest.fn().mockResolvedValue({ count: 1 }),
      deleteDocumentFromDb: jest.fn().mockResolvedValue({ count: 1 }),
    };
    deleteFromVectorStore = { delete: jest.fn().mockResolvedValue(undefined) };
    s3 = { delete: jest.fn().mockResolvedValue(undefined) };

    service = new DeleteFileService(
      prisma,
      filesService as unknown as FilesService,
      deleteFromVectorStore as unknown as DeleteFileFromVectorStoreService,
      s3 as unknown as S3StorageService,
    );
  });

  it('returns deleted:false without touching S3/vectors when the file is not found', async () => {
    findFirst.mockResolvedValue(null);

    const result = await service.deleteFile({
      fileId: 'missing',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      deleted: false,
      fileId: 'missing',
      fileName: null,
    });
    expect(filesService.deleteFileFromDb).not.toHaveBeenCalled();
    expect(s3.delete).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the given project when projectId is provided', async () => {
    await service.deleteFile({
      fileId: 'file-1',
      organizationId: 'org-1',
      projectId: 'proj-1',
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1', projectId: 'proj-1' },
    });
  });

  it('deletes the DB row, the S3 object (org-prefixed key), and vector store entries', async () => {
    const result = await service.deleteFile({
      fileId: 'file-1',
      organizationId: 'org-1',
    });

    expect(filesService.deleteFileFromDb).toHaveBeenCalledWith(
      'file-1',
      'org-1',
    );
    expect(s3.delete).toHaveBeenCalledWith('org-1/file-1.pdf');
    expect(deleteFromVectorStore.delete).toHaveBeenCalledWith(
      'file-1',
      'org-1',
    );
    expect(result).toEqual({
      deleted: true,
      fileId: 'file-1',
      fileName: 'report.pdf',
    });
  });

  it('also deletes the thumbnail by its raw key (no org prefix) when present', async () => {
    findFirst.mockResolvedValue({
      ...fileRecord,
      thumbnailS3Key: 'thumbs/file-1.png',
    });

    await service.deleteFile({ fileId: 'file-1', organizationId: 'org-1' });

    expect(s3.delete).toHaveBeenCalledWith('thumbs/file-1.png');
  });

  it('cleans up the attached UserDocument when documentId is set', async () => {
    findFirst.mockResolvedValue({ ...fileRecord, documentId: 'doc-1' });

    await service.deleteFile({ fileId: 'file-1', organizationId: 'org-1' });

    expect(filesService.deleteDocumentFromDb).toHaveBeenCalledWith(
      'doc-1',
      'org-1',
    );
  });

  it('returns deleted:false when the delete race-loses (count 0)', async () => {
    filesService.deleteFileFromDb.mockResolvedValue({ count: 0 });

    const result = await service.deleteFile({
      fileId: 'file-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      deleted: false,
      fileId: 'file-1',
      fileName: 'report.pdf',
    });
    expect(s3.delete).not.toHaveBeenCalled();
  });

  it('is best-effort on S3 cleanup failure — still reports deleted:true', async () => {
    s3.delete.mockRejectedValue(new Error('s3 down'));

    const result = await service.deleteFile({
      fileId: 'file-1',
      organizationId: 'org-1',
    });

    expect(result.deleted).toBe(true);
    expect(deleteFromVectorStore.delete).toHaveBeenCalled();
  });

  it('is best-effort on vector store cleanup failure — still reports deleted:true', async () => {
    deleteFromVectorStore.delete.mockRejectedValue(new Error('qdrant down'));

    const result = await service.deleteFile({
      fileId: 'file-1',
      organizationId: 'org-1',
    });

    expect(result.deleted).toBe(true);
  });
});
