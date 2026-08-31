/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { ChatService } from './chat.service.js';
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

  let prisma: { client: { project: { findFirst: jest.Mock } } };
  let apiLimits: { checkApiRequestLimit: jest.Mock };
  let organizationSettings: { getAllSettings: jest.Mock };
  let resolveLiteLLMKey: { resolveForRequest: jest.Mock };
  let loadMcpTools: { loadMcpToolsForApiRequest: jest.Mock };
  let initializeBasicRag: { initializeRagChain: jest.Mock };
  let persistApiThread: { createApiThread: jest.Mock };
  let aiUsage: { track: jest.Mock };

  const mockContext: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  const baseDto: ChatDto = {
    assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    content: 'hello',
    stream: false,
  };

  const closeMcpClients = jest.fn().mockResolvedValue(undefined);

  function createMockReq(): Request {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { headers: {} }) as unknown as Request;
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

  function makeChain(overrides: {
    fullStream?: AsyncIterable<
      | { type: 'text-delta'; textDelta: string }
      | { type: 'reasoning-delta'; delta: string }
    >;
    textStream?: AsyncIterable<string>;
    usage?: unknown;
  }) {
    function* defaultTextStream() {
      yield 'response';
    }
    function* defaultFullStream() {
      yield { type: 'text-delta' as const, textDelta: 'response' };
    }
    const streamResult = {
      textStream: overrides.textStream ?? defaultTextStream(),
      fullStream: overrides.fullStream ?? defaultFullStream(),
      text: Promise.resolve('response'),
      reasoningText: Promise.resolve(undefined),
      usage:
        overrides.usage ??
        Promise.resolve({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        }),
      sourceFileIds: Promise.resolve([]),
    };
    // initializeRagChain() resolves to { stream: (input) => Promise<...> },
    // not the stream result directly — mirror that shape here.
    return { stream: jest.fn().mockResolvedValue(streamResult) };
  }

  beforeEach(() => {
    prisma = { client: { project: { findFirst: jest.fn() } } };
    apiLimits = { checkApiRequestLimit: jest.fn() };
    organizationSettings = { getAllSettings: jest.fn() };
    resolveLiteLLMKey = { resolveForRequest: jest.fn() };
    loadMcpTools = { loadMcpToolsForApiRequest: jest.fn() };
    initializeBasicRag = { initializeRagChain: jest.fn() };
    persistApiThread = { createApiThread: jest.fn() };
    aiUsage = { track: jest.fn().mockResolvedValue(undefined) };

    prisma.client.project.findFirst.mockResolvedValue({
      settings: { instructions: 'be nice' },
    });
    apiLimits.checkApiRequestLimit.mockResolvedValue({
      exceeded: false,
      current: 0,
      limit: null,
    });
    organizationSettings.getAllSettings.mockResolvedValue({
      apiKey: 'sk-pool',
      model: 'gpt-5.4',
      temperature: 0.7,
      prompt: '',
      maxDocumentsToRetrieve: 4,
    });
    resolveLiteLLMKey.resolveForRequest.mockResolvedValue({
      apiKey: 'sk-litellm',
      teamId: null,
      source: 'org',
    });
    loadMcpTools.loadMcpToolsForApiRequest.mockResolvedValue({
      mcpTools: undefined,
      mcpContext: undefined,
      closeMcpClients,
    });
    closeMcpClients.mockClear();

    service = new ChatService(
      prisma as any,
      apiLimits as any,
      organizationSettings as any,
      resolveLiteLLMKey as any,
      loadMcpTools as any,
      initializeBasicRag as any,
      persistApiThread as any,
      aiUsage as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 404 when the assistant/project is not found', async () => {
    prisma.client.project.findFirst.mockResolvedValue(null);
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(baseDto, mockContext, req, res);

    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json).toHaveBeenCalledWith({
      error: 'Assistant not found',
      code: 404,
    });
    expect(initializeBasicRag.initializeRagChain).not.toHaveBeenCalled();
  });

  it('returns 429 when the monthly API request limit is exceeded', async () => {
    apiLimits.checkApiRequestLimit.mockResolvedValue({
      exceeded: true,
      current: 100,
      limit: 100,
    });
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(baseDto, mockContext, req, res);

    expect((res as any).status).toHaveBeenCalledWith(429);
    expect((res as any).json).toHaveBeenCalledWith({
      error: 'Monthly API request limit exceeded',
      code: 429,
      limit: 100,
      current: 100,
    });
    expect(initializeBasicRag.initializeRagChain).not.toHaveBeenCalled();
  });

  it('scopes the project lookup to the caller org (IDOR guard)', async () => {
    const req = createMockReq();
    const res = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.chat(baseDto, mockContext, req, res);

    expect(prisma.client.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        organizationId: 'org-1',
      },
      select: { settings: { select: { instructions: true } } },
    });
  });

  it('strips the asst- prefix from assistant_id when resolving the project', async () => {
    const req = createMockReq();
    const res = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.chat(
      { ...baseDto, assistant_id: 'asst-a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      mockContext,
      req,
      res,
    );

    expect(prisma.client.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        }),
      }),
    );
  });

  it('returns JSON for non-streaming requests and tracks usage', async () => {
    const req = createMockReq();
    const res = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.chat(baseDto, mockContext, req, res);

    expect((res as any).json).toHaveBeenCalledWith({ text: 'response' });
    expect(aiUsage.track).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        step: 'CHAT_COMPLETION',
        provider: 'litellm',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        metadata: { source: 'API' },
      }),
    );
    expect(closeMcpClients).toHaveBeenCalledTimes(1);
  });

  it('streams SSE text-delta/reasoning-delta parts and terminates with [DONE]', async () => {
    function* fullStream() {
      yield { type: 'text-delta' as const, textDelta: 'Hel' };
      yield { type: 'reasoning-delta' as const, delta: 'thinking' };
      yield { type: 'text-delta' as const, textDelta: 'lo' };
    }
    const req = createMockReq();
    const res = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(
      makeChain({ fullStream: fullStream() }),
    );

    await service.chat({ ...baseDto, stream: true }, mockContext, req, res);

    const writeMock = (res as any).write as jest.Mock;
    const writes: string[] = writeMock.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(writes).toEqual([
      `data: ${JSON.stringify({ text: 'Hel' })}\n\n`,
      `data: ${JSON.stringify({ reasoning: 'thinking' })}\n\n`,
      `data: ${JSON.stringify({ text: 'lo' })}\n\n`,
      'data: [DONE]\n\n',
    ]);
    expect((res as any).end).toHaveBeenCalled();
    expect(closeMcpClients).toHaveBeenCalledTimes(1);
  });

  it('persists an API thread when the API key has debug mode enabled', async () => {
    const saveAssistantMessage = jest.fn().mockResolvedValue(undefined);
    persistApiThread.createApiThread.mockResolvedValue({
      threadId: 'thread-1',
      saveAssistantMessage,
    });
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(baseDto, { ...mockContext, debugMode: true }, req, res);

    expect(persistApiThread.createApiThread).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', userId: 'user-1' }),
    );
    expect(saveAssistantMessage).toHaveBeenCalledWith('response');
  });

  it('does not persist a thread when debug mode is off', async () => {
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(baseDto, mockContext, req, res);

    expect(persistApiThread.createApiThread).not.toHaveBeenCalled();
  });

  it('defaults reasoning effort to medium for a model that supports it, unless explicitly set', async () => {
    organizationSettings.getAllSettings.mockResolvedValue({
      apiKey: 'sk-pool',
      model: 'gpt-oss-120b',
      temperature: 0.7,
      prompt: '',
      maxDocumentsToRetrieve: 4,
    });
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(baseDto, mockContext, req, res);

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'medium' }),
    );
  });

  it('respects an explicit reasoning_effort over the derived default', async () => {
    organizationSettings.getAllSettings.mockResolvedValue({
      apiKey: 'sk-pool',
      model: 'gpt-oss-120b',
      temperature: 0.7,
      prompt: '',
      maxDocumentsToRetrieve: 4,
    });
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(
      { ...baseDto, reasoning_effort: 'low' },
      mockContext,
      req,
      res,
    );

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'low' }),
    );
  });

  it('closes MCP clients and returns 500 when chain initialization throws', async () => {
    initializeBasicRag.initializeRagChain.mockRejectedValue(new Error('boom'));
    const req = createMockReq();
    const res = createMockRes();

    await service.chat(baseDto, mockContext, req, res);

    expect(closeMcpClients).toHaveBeenCalledTimes(1);
    expect((res as any).status).toHaveBeenCalledWith(500);
    expect((res as any).send).toHaveBeenCalledWith('Internal Server Error');
  });
});
