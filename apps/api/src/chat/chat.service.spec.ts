/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ChatService } from './chat.service.js';
import { ConfigService } from '@nestjs/config';
import { RagenAppClient } from '../common/services/ragen-app.client.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';
import { type ChatDto } from './dto/chat.dto.js';
import { type Request, type Response } from 'express';
import { EventEmitter } from 'events';

describe('ChatService', () => {
  let service: ChatService;
  const targetUrl = 'http://ragen-app:3000';
  const internalSecret = 'test-internal-secret';

  const mockContext: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  function createMockReq(): Request {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      headers: {},
    }) as unknown as Request;
  }

  function createMockRes(): Response {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    return res as unknown as Response;
  }

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'RAGEN_APP_INTERNAL_URL') {
          return targetUrl;
        }
        if (key === 'INTERNAL_API_SECRET') {
          return internalSecret;
        }
        throw new Error(`Unknown key: ${key}`);
      }),
    } as unknown as ConfigService;

    const ragenAppClient = new RagenAppClient(configService);
    service = new ChatService(ragenAppClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass context headers and internal secret to ragen-app', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ text: 'hi' })));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'hello',
      stream: false,
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${targetUrl}/api/v1/chat`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-internal-secret': internalSecret,
          'x-org-id': 'org-1',
          'x-user-id': 'user-1',
          'x-project-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        }),
      }),
    );
  });

  it('should NOT pass authorization header to ragen-app', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ text: 'hi' })));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'hello',
      stream: false,
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    const passedHeaders = fetchSpy.mock.calls[0][1]!.headers as Record<
      string,
      string
    >;
    expect(passedHeaders).not.toHaveProperty('authorization');
  });

  it('should forward JSON response for non-streaming requests', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ text: 'response' })));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'hello',
      stream: false,
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    expect((res as any).json).toHaveBeenCalledWith({ text: 'response' });
  });

  it('should return 502 when ragen-app is unreachable', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED'));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'hello',
      stream: false,
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    expect((res as any).status).toHaveBeenCalledWith(502);
    expect((res as any).json).toHaveBeenCalledWith({
      error: 'Upstream service unavailable',
    });
  });

  it('should forward upstream error status', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Not Found', { status: 404 }));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'hello',
      stream: false,
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).send).toHaveBeenCalledWith('Not Found');
  });

  it('should send prompt and context in body', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ text: 'hi' })));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'question',
      context: 'page context',
      stream: true,
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    const body = JSON.parse(
      fetchSpy.mock.calls[0][1]!.body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({
      prompt: 'question',
      context: 'page context',
      stream: true,
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      reasoning_effort: undefined,
    });
  });

  it('should forward reasoning_effort to ragen-app when provided', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ text: 'hi' })));

    const dto: ChatDto = {
      assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: 'think hard',
      stream: false,
      reasoning_effort: 'high',
    };
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(dto, mockContext, req, res);

    const body = JSON.parse(
      fetchSpy.mock.calls[0][1]!.body as string,
    ) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('high');
  });
});
