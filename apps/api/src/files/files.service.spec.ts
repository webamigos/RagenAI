/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { Mock } from 'vitest';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { EventEmitter } from 'events';
import { FilesService } from './files.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import {
  type UploadFileService,
  UploadRejectedError,
} from '../documents/upload-file.service.js';
import { type DeleteFileService } from '../documents/delete-file.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';

describe('FilesService', () => {
  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  function buildService(
    prismaRows: unknown[] = [],
    findFirstRow: unknown = null,
  ) {
    const findMany = vi.fn().mockResolvedValue(prismaRows);
    const findFirst = vi.fn().mockResolvedValue(findFirstRow);
    const organizationFindUnique = vi.fn().mockResolvedValue({ slug: 'acme' });
    const prisma = {
      client: {
        userFile: { findMany, findFirst },
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'proj-1' }) },
        organization: { findUnique: organizationFindUnique },
      },
    } as unknown as PrismaService;

    const uploadFileMock = vi.fn();
    const uploadFile = {
      uploadFile: uploadFileMock,
    } as unknown as UploadFileService;
    const deleteFileMock = vi.fn();
    const deleteFile = {
      deleteFile: deleteFileMock,
    } as unknown as DeleteFileService;

    return {
      service: new FilesService(
        prisma,
        uploadFile,
        deleteFile,
        new AssistantScopeService(prisma),
      ),
      prisma,
      organizationFindUnique,
      uploadFileMock,
      deleteFileMock,
    };
  }

  function mockReq(): Request {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { headers: {} }) as unknown as Request;
  }

  function mockRes() {
    const res: Record<string, Mock> = {};
    res.json = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);
    return res as unknown as Response;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('list: returns OpenAI envelope with file-prefixed ids', async () => {
    const rows = [
      {
        id: 'abc',
        fileName: 'a.pdf',
        fileSize: 10,
        createdAt: new Date('2026-01-01Z'),
        parsingStatus: 'COMPLETED',
        embeddingStatus: 'COMPLETED',
      },
      {
        id: 'def',
        fileName: 'b.pdf',
        fileSize: 20,
        createdAt: new Date('2026-01-02Z'),
        parsingStatus: 'NOT_STARTED',
        embeddingStatus: 'NOT_STARTED',
      },
    ];
    const { service } = buildService(rows);
    const result = await service.list(context, {});
    expect(result.object).toBe('list');
    expect(result.data.map((f) => f.id)).toEqual(['file-abc', 'file-def']);
    expect(result.data[0].status).toBe('processed');
    expect(result.data[1].status).toBe('uploaded');
  });

  it('list: scopes query by org and project, and honors limit', async () => {
    const { service, prisma } = buildService([]);
    await service.list(context, { limit: 5 });
    const call = (prisma.client.userFile.findMany as Mock).mock.calls[0][0];
    expect(call.where).toEqual({
      organizationId: 'org-1',
      projectId: 'proj-1',
    });
    expect(call.take).toBe(5);
  });

  // The shape every key in the product actually has: no bound project, because
  // nothing has ever written `ApiKey.projectId`. The org clause used to be
  // absent here and the project clause was `undefined`, which Prisma drops —
  // so this endpoint listed every organization's files to any valid key.
  it('list: still scopes by org when the key has no project', async () => {
    const { service, prisma } = buildService([]);
    const { projectId: _unused, ...keyWithoutProject } = context;
    await service.list(keyWithoutProject, {});
    const call = (prisma.client.userFile.findMany as Mock).mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: 'org-1' });
    expect(call.where.projectId).toBeUndefined();
  });

  it('get: still scopes by org when the key has no project', async () => {
    const { service, prisma } = buildService([], null);
    const { projectId: _unused, ...keyWithoutProject } = context;
    await expect(
      service.get('file-abc', keyWithoutProject),
    ).rejects.toBeInstanceOf(NotFoundException);
    const call = (prisma.client.userFile.findFirst as Mock).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'abc', organizationId: 'org-1' });
  });

  it('list: decodes cursor by stripping file- prefix', async () => {
    const { service, prisma } = buildService([]);
    await service.list(context, { after: 'file-abc' });
    const call = (prisma.client.userFile.findMany as Mock).mock.calls[0][0];
    expect(call.cursor).toEqual({ id: 'abc' });
    expect(call.skip).toBe(1);
  });

  it('get: scopes query by org and project', async () => {
    const { service, prisma } = buildService([], null);
    await expect(service.get('file-abc', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const call = (prisma.client.userFile.findFirst as Mock).mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'abc',
      organizationId: 'org-1',
      projectId: 'proj-1',
    });
  });

  it('get: returns the OpenAI file when found', async () => {
    const row = {
      id: 'abc',
      fileName: 'doc.pdf',
      fileSize: 10,
      createdAt: new Date('2026-01-01Z'),
      parsingStatus: 'COMPLETED',
      embeddingStatus: 'COMPLETED',
    };
    const { service } = buildService([], row);
    const result = await service.get('file-abc', context);
    expect(result.id).toBe('file-abc');
    expect(result.status).toBe('processed');
  });

  it('get: throws NotFoundException when missing', async () => {
    const { service } = buildService([], null);
    await expect(service.get('file-missing', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('upload: rejects when file is missing', async () => {
    const { service } = buildService();
    await expect(
      service.upload(
        undefined as unknown as Express.Multer.File,
        undefined,
        context,
        mockReq(),
        mockRes(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upload: rejects unsupported purpose', async () => {
    const { service } = buildService();
    const file = {
      originalname: 'x.pdf',
      mimetype: 'application/pdf',
      size: 1,
      buffer: Buffer.from('x'),
    } as unknown as Express.Multer.File;

    await expect(
      service.upload(file, 'fine-tune', context, mockReq(), mockRes()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upload: accepts `assistants` as purpose alias and returns the OpenAI file shape', async () => {
    const { service, uploadFileMock, organizationFindUnique } = buildService();
    uploadFileMock.mockResolvedValue({
      fileRecord: {
        id: 'xyz',
        fileName: 'x.pdf',
        fileSize: 1,
        createdAt: new Date('2026-01-01Z'),
        parsingStatus: 'NOT_STARTED',
        embeddingStatus: 'NOT_STARTED',
      },
      workflowId: 'doc-abc',
    });
    const file = {
      originalname: 'x.pdf',
      mimetype: 'application/pdf',
      size: 1,
      buffer: Buffer.from('x'),
    } as unknown as Express.Multer.File;
    const res = mockRes();

    await service.upload(file, 'assistants', context, mockReq(), res);

    expect(organizationFindUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { slug: true },
    });
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        organizationSlug: 'acme',
        projectId: 'proj-1',
        userId: 'user-1',
      }),
    );
    expect((res as any).status).toHaveBeenCalledWith(200);
    const body = (res.json as Mock).mock.calls[0][0];
    expect(body.id).toBe('file-xyz');
    expect(body.object).toBe('file');
  });

  it('upload: maps UploadRejectedError to the right HTTP status with an OpenAI error envelope', async () => {
    const { service, uploadFileMock } = buildService();
    uploadFileMock.mockRejectedValue(
      new UploadRejectedError(
        'single_file_limit',
        'File exceeds per-file limit',
      ),
    );
    const file = {
      originalname: 'x.pdf',
      mimetype: 'application/pdf',
      size: 1,
      buffer: Buffer.from('x'),
    } as unknown as Express.Multer.File;
    const res = mockRes();

    await service.upload(file, undefined, context, mockReq(), res);

    expect((res as any).status).toHaveBeenCalledWith(413);
    const body = (res.json as Mock).mock.calls[0][0];
    expect(body.error.message).toBe('File exceeds per-file limit');
  });

  it('upload: maps an S3/workflow failure to a 502', async () => {
    const { service, uploadFileMock } = buildService();
    uploadFileMock.mockRejectedValue(
      new UploadRejectedError('s3_upload_failed', 'Failed to store file'),
    );
    const file = {
      originalname: 'x.pdf',
      mimetype: 'application/pdf',
      size: 1,
      buffer: Buffer.from('x'),
    } as unknown as Express.Multer.File;
    const res = mockRes();

    await service.upload(file, undefined, context, mockReq(), res);

    expect((res as any).status).toHaveBeenCalledWith(502);
  });

  it('remove: strips the file- prefix and returns the OpenAI delete shape', async () => {
    const { service, deleteFileMock } = buildService([], { id: 'abc' });
    deleteFileMock.mockResolvedValue({
      deleted: true,
      fileId: 'abc',
      fileName: 'a.pdf',
    });

    const result = await service.remove('file-abc', context);

    expect(deleteFileMock).toHaveBeenCalledWith({
      fileId: 'abc',
      organizationId: 'org-1',
    });
    expect(result).toEqual({ id: 'file-abc', object: 'file', deleted: true });
  });

  it('remove: throws NotFoundException when the underlying delete no-ops', async () => {
    const { service, deleteFileMock } = buildService();
    deleteFileMock.mockResolvedValue({
      deleted: false,
      fileId: 'abc',
      fileName: null,
    });

    await expect(service.remove('file-abc', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  // The key's scope decides which files exist for this caller, the same split
  // the retrieval filter makes — an assistant key sees its assistant's files,
  // a knowledge-base key sees the ones that belong to no assistant.
  describe('the key scope narrows within the organization', () => {
    const boundKey: ApiContext = {
      ...context,
      knowledgeScope: 'ASSISTANT',
      projectId: 'proj-1' as ProjectId,
    };
    const kbKey: ApiContext = {
      orgId: context.orgId,
      userId: context.userId,
      keyId: context.keyId,
      debugMode: false,
      knowledgeScope: 'KNOWLEDGE_BASE',
    };

    it('an assistant key lists its assistant files', async () => {
      const { service, prisma } = buildService([]);
      await service.list(boundKey, {});
      expect(
        (prisma.client.userFile.findMany as Mock).mock.calls[0][0].where,
      ).toEqual({ organizationId: 'org-1', projectId: 'proj-1' });
    });

    it('a knowledge-base key lists the files with no assistant', async () => {
      const { service, prisma } = buildService([]);
      await service.list(kbKey, {});
      expect(
        (prisma.client.userFile.findMany as Mock).mock.calls[0][0].where,
      ).toEqual({ organizationId: 'org-1', projectId: null });
    });

    it('an orphaned assistant key is refused rather than widened', async () => {
      const { service } = buildService([]);
      await expect(
        service.list({ ...kbKey, knowledgeScope: 'ASSISTANT' }, {}),
      ).rejects.toThrow(/no longer exists/);
    });

    // deleteFile() scopes by organization, which stopped being the whole
    // boundary the moment a key could be confined to one assistant.
    it('delete refuses a file outside the key scope before deleting anything', async () => {
      const { service, prisma, deleteFileMock } = buildService([], null);
      await expect(service.remove('file-abc', boundKey)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(
        (prisma.client.userFile.findFirst as Mock).mock.calls[0][0].where,
      ).toEqual({ id: 'abc', organizationId: 'org-1', projectId: 'proj-1' });
      expect(deleteFileMock).not.toHaveBeenCalled();
    });
  });
});
