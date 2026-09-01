/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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
    const findMany = jest.fn().mockResolvedValue(prismaRows);
    const findFirst = jest.fn().mockResolvedValue(findFirstRow);
    const organizationFindUnique = jest
      .fn()
      .mockResolvedValue({ slug: 'acme' });
    const prisma = {
      client: {
        userFile: { findMany, findFirst },
        organization: { findUnique: organizationFindUnique },
      },
    } as unknown as PrismaService;

    const uploadFileMock = jest.fn();
    const uploadFile = {
      uploadFile: uploadFileMock,
    } as unknown as UploadFileService;
    const deleteFileMock = jest.fn();
    const deleteFile = {
      deleteFile: deleteFileMock,
    } as unknown as DeleteFileService;

    return {
      service: new FilesService(prisma, uploadFile, deleteFile),
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
    const res: Record<string, jest.Mock> = {};
    res.json = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    return res as unknown as Response;
  }

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('list: scopes query by projectId and honors limit', async () => {
    const { service, prisma } = buildService([]);
    await service.list(context, { limit: 5 });
    const call = (prisma.client.userFile.findMany as jest.Mock).mock
      .calls[0][0];
    expect(call.where).toEqual({ projectId: 'proj-1' });
    expect(call.take).toBe(5);
  });

  it('list: decodes cursor by stripping file- prefix', async () => {
    const { service, prisma } = buildService([]);
    await service.list(context, { after: 'file-abc' });
    const call = (prisma.client.userFile.findMany as jest.Mock).mock
      .calls[0][0];
    expect(call.cursor).toEqual({ id: 'abc' });
    expect(call.skip).toBe(1);
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
    const body = (res.json as jest.Mock).mock.calls[0][0];
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
    const body = (res.json as jest.Mock).mock.calls[0][0];
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
    const { service, deleteFileMock } = buildService();
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
});
