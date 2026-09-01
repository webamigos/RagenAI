/* eslint-disable @typescript-eslint/unbound-method */
const mockIsEncryptionEnabled = jest.fn();
const mockGenerateThreadKey = jest.fn();
const mockEncryptContent = jest.fn();
const mockDecryptThreadKey = jest.fn();

jest.mock('../crypto/thread-encryption.js', () => ({
  isEncryptionEnabled: () => mockIsEncryptionEnabled(),
  generateThreadKey: () => mockGenerateThreadKey(),
  encryptContent: (content: string, dek: Buffer) =>
    mockEncryptContent(content, dek),
  decryptThreadKey: (encryptedDek: string) =>
    mockDecryptThreadKey(encryptedDek),
}));

const mockDecryptDocumentContent = jest.fn();
jest.mock('../crypto/decrypt-documents.js', () => ({
  decryptDocumentContent: (content: string, encryptedDek: string | null) =>
    mockDecryptDocumentContent(content, encryptedDek),
}));

import { FilesService } from './files.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type AuditLogService } from '../audit-logs/audit-log.service.js';
import { type ProjectsService } from '../projects/projects.service.js';

describe('FilesService', () => {
  function makeService(overrides: {
    userFile?: Partial<Record<string, jest.Mock>>;
    userDocument?: Partial<Record<string, jest.Mock>>;
    documentFolder?: Partial<Record<string, jest.Mock>>;
    getProjectByIdOrThrow?: jest.Mock;
  }) {
    const userFileOps = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides.userFile,
    };
    const userDocumentOps = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides.userDocument,
    };
    const documentFolderOps = {
      findFirst: jest.fn(),
      ...overrides.documentFolder,
    };

    const prisma = {
      client: {
        userFile: userFileOps,
        userDocument: userDocumentOps,
        documentFolder: documentFolderOps,
      },
    } as unknown as PrismaService;

    const auditLog = { track: jest.fn() } as unknown as AuditLogService;
    const projects = {
      getProjectByIdOrThrow: overrides.getProjectByIdOrThrow ?? jest.fn(),
    } as unknown as ProjectsService;

    return {
      service: new FilesService(prisma, auditLog, projects),
      prisma,
      auditLog,
      projects,
    };
  }

  beforeEach(() => {
    mockIsEncryptionEnabled.mockReset().mockReturnValue(false);
    mockGenerateThreadKey.mockReset();
    mockEncryptContent.mockReset();
    mockDecryptThreadKey.mockReset();
    mockDecryptDocumentContent
      .mockReset()
      .mockImplementation((c: string) => Promise.resolve(c));
  });

  describe('createFile', () => {
    it('creates the file and audit-logs the upload', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'file-1' });
      const { service, auditLog } = makeService({ userFile: { create } });

      const file = await service.createFile(
        'doc.pdf',
        1024,
        'org-1',
        'PDF',
        'project-1',
      );

      expect(file).toEqual({ id: 'file-1' });
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          action: 'document.uploaded',
          entityType: 'document',
          entityId: 'file-1',
        }),
      );
    });
  });

  describe('createDocument', () => {
    it('stores content unencrypted when encryption is disabled', async () => {
      mockIsEncryptionEnabled.mockReturnValue(false);
      const create = jest.fn().mockResolvedValue({ id: 'doc-1' });
      const { service } = makeService({ userDocument: { create } });

      await service.createDocument({
        id: 'doc-1',
        title: 'Title',
        content: 'plain content',
        organizationId: 'org-1',
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'plain content',
          encryptedDek: null,
        }),
      });
    });

    it('encrypts content when encryption is enabled', async () => {
      mockIsEncryptionEnabled.mockReturnValue(true);
      mockGenerateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('dek'),
        encryptedDek: 'encrypted-dek',
      });
      mockEncryptContent.mockReturnValue('cipher-text');
      const create = jest.fn().mockResolvedValue({ id: 'doc-1' });
      const { service } = makeService({ userDocument: { create } });

      await service.createDocument({
        id: 'doc-1',
        title: 'Title',
        content: 'plain content',
        organizationId: 'org-1',
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: 'cipher-text',
          encryptedDek: 'encrypted-dek',
        }),
      });
    });
  });

  describe('updateDocumentContent', () => {
    it('clears the DEK when content is cleared', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const { service } = makeService({ userDocument: { updateMany } });

      await service.updateDocumentContent({
        orgId: 'org-1',
        documentId: 'doc-1',
        content: undefined,
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', id: 'doc-1' },
        data: {
          content: undefined,
          encryptedDek: null,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('reuses an existing DEK to re-encrypt content', async () => {
      mockIsEncryptionEnabled.mockReturnValue(true);
      mockDecryptThreadKey.mockResolvedValue(Buffer.from('existing-dek'));
      mockEncryptContent.mockReturnValue('cipher-text-2');
      const findFirst = jest
        .fn()
        .mockResolvedValue({ encryptedDek: 'existing-encrypted-dek' });
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const { service } = makeService({
        userDocument: { findFirst, updateMany },
      });

      await service.updateDocumentContent({
        orgId: 'org-1',
        documentId: 'doc-1',
        content: 'new content',
      });

      expect(mockDecryptThreadKey).toHaveBeenCalledWith(
        'existing-encrypted-dek',
      );
      expect(updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', id: 'doc-1' },
        data: {
          content: 'cipher-text-2',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('deleteFileFromDb', () => {
    it('deletes and audit-logs the deletion', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const { service, auditLog } = makeService({
        userFile: { deleteMany },
      });

      const result = await service.deleteFileFromDb('file-1', 'org-1');

      expect(result).toEqual({ count: 1 });
      expect(deleteMany).toHaveBeenCalledWith({
        where: { id: 'file-1', organizationId: 'org-1' },
      });
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          action: 'document.deleted',
          entityId: 'file-1',
        }),
      );
    });
  });

  describe('moveFileToFolder', () => {
    it('returns failure when the file is not found', async () => {
      const { service } = makeService({
        userFile: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.moveFileToFolder(
        'file-1',
        'folder-1',
        'org-1',
      );
      expect(result).toEqual({ success: false, error: 'File not found' });
    });

    it('returns failure when the target folder is not found', async () => {
      const { service } = makeService({
        userFile: { findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }) },
        documentFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.moveFileToFolder(
        'file-1',
        'folder-1',
        'org-1',
      );
      expect(result).toEqual({ success: false, error: 'Folder not found' });
    });

    it('moves the file when both exist', async () => {
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({
        userFile: {
          findFirst: jest.fn().mockResolvedValue({ id: 'file-1' }),
          update,
        },
        documentFolder: {
          findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }),
        },
      });
      const result = await service.moveFileToFolder(
        'file-1',
        'folder-1',
        'org-1',
      );
      expect(result).toEqual({ success: true });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { folderId: 'folder-1' },
      });
    });
  });

  describe('importFileToProject', () => {
    it('rejects importing into a project of another organization', async () => {
      const { service } = makeService({
        getProjectByIdOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'project-1', organizationId: 'org-2' }),
      });

      await expect(
        service.importFileToProject('source-1', 'project-1', 'org-1'),
      ).rejects.toThrow(
        'Cannot import file to a project in another organization',
      );
    });

    it('rejects a missing source file', async () => {
      const { service } = makeService({
        getProjectByIdOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'project-1', organizationId: 'org-1' }),
        userFile: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.importFileToProject('source-1', 'project-1', 'org-1'),
      ).rejects.toThrow('Source file not found');
    });

    it('returns alreadyExists when a matching file is already in the project', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'source-1', fileName: 'doc.pdf' })
        .mockResolvedValueOnce({ id: 'existing-1' });

      const { service } = makeService({
        getProjectByIdOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'project-1', organizationId: 'org-1' }),
        userFile: { findFirst },
      });

      const result = await service.importFileToProject(
        'source-1',
        'project-1',
        'org-1',
      );

      expect(result).toEqual({
        alreadyExists: true,
        file: { id: 'existing-1' },
      });
    });

    it('creates a lightweight copy referencing the source file', async () => {
      const sourceFile = {
        id: 'source-1',
        fileName: 'doc.pdf',
        fileSize: 100,
        fileType: 'PDF',
        metadata: { foo: 'bar' },
        isUploaded: true,
        uploadedAt: new Date('2026-01-01'),
        isBinaryFile: true,
        fileExtension: 'pdf',
        fileMimeType: 'application/pdf',
        parsingStatus: 'COMPLETED',
        embeddingStatus: 'COMPLETED',
        parsingCompletedAt: new Date('2026-01-01'),
        embeddingCompletedAt: new Date('2026-01-01'),
      };
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce(sourceFile)
        .mockResolvedValueOnce(null);
      const create = jest.fn().mockResolvedValue({ id: 'new-file-1' });

      const { service } = makeService({
        getProjectByIdOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'project-1', organizationId: 'org-1' }),
        userFile: { findFirst, create },
      });

      const result = await service.importFileToProject(
        'source-1',
        'project-1',
        'org-1',
      );

      expect(result).toEqual({
        alreadyExists: false,
        file: { id: 'new-file-1' },
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            fileName: 'doc.pdf',
            projectId: 'project-1',
            sourceFileId: 'source-1',
          }),
        }),
      );
    });
  });

  describe('getDocumentById', () => {
    it('returns null when the document is not found', async () => {
      const { service } = makeService({
        userDocument: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      const result = await service.getDocumentById('doc-1', 'org-1');
      expect(result).toBeNull();
    });

    it('decrypts content and strips the encryptedDek field', async () => {
      mockDecryptDocumentContent.mockResolvedValue('decrypted content');
      const { service } = makeService({
        userDocument: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'doc-1',
            title: 'Title',
            content: 'cipher',
            encryptedDek: 'dek',
          }),
        },
      });

      const result = await service.getDocumentById('doc-1', 'org-1');

      expect(result).toEqual({
        id: 'doc-1',
        title: 'Title',
        content: 'decrypted content',
      });
      expect(mockDecryptDocumentContent).toHaveBeenCalledWith('cipher', 'dek');
    });
  });

  describe('getUserFiles', () => {
    it('scopes to owned files for my-files view', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const { service } = makeService({ userFile: { findMany, count } });

      await service.getUserFiles('org-1', [], {
        userId: 'user-1',
        viewMode: 'my-files',
      });

      expect(count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 'org-1',
          ownerId: 'user-1',
        }),
      });
    });

    it('paginates and returns totalPages', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(51);
      const { service } = makeService({ userFile: { findMany, count } });

      const result = await service.getUserFiles('org-1', [], { pageSize: 25 });

      expect(result.totalCount).toBe(51);
      expect(result.totalPages).toBe(3);
    });
  });
});
