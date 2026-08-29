/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request, type Response } from 'express';
import { EventEmitter } from 'events';
import { FilesService } from './files.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RagenAppClient } from '../common/services/ragen-app.client.js';
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
    const configService = {
      getOrThrow: jest.fn((key: string) =>
        key === 'RAGEN_APP_INTERNAL_URL'
          ? 'http://ragen-app:3000'
          : 'test-secret',
      ),
    } as unknown as ConfigService;
    const client = new RagenAppClient(configService);

    const prisma = {
      client: {
        userFile: {
          findMany: jest.fn().mockResolvedValue(prismaRows),
          findFirst: jest.fn().mockResolvedValue(findFirstRow),
        },
      },
    } as unknown as PrismaService;

    return { service: new FilesService(prisma, client), prisma, client };
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

  it('upload: accepts `assistants` as purpose alias', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          file: {
            id: 'xyz',
            fileName: 'x.pdf',
            fileSize: 1,
            createdAt: '2026-01-01Z',
            parsingStatus: 'NOT_STARTED',
            embeddingStatus: 'NOT_STARTED',
          },
          workflowId: 'doc-abc',
        }),
        { status: 200 },
      ),
    );

    const { service } = buildService();
    const file = {
      originalname: 'x.pdf',
      mimetype: 'application/pdf',
      size: 1,
      buffer: Buffer.from('x'),
    } as unknown as Express.Multer.File;
    const res = mockRes();

    await service.upload(file, 'assistants', context, mockReq(), res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.id).toBe('file-xyz');
    expect(body.object).toBe('file');
  });

  it('remove: strips prefix before proxying and returns OpenAI delete shape', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ deleted: true, id: 'abc' })),
      );

    const { service } = buildService();
    const result = await service.remove('file-abc', context);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/files/abc'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result).toEqual({ id: 'file-abc', object: 'file', deleted: true });
  });
});
