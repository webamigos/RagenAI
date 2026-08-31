/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { HttpException, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { type Request, type Response } from 'express';
import { ChatCompletionsService } from './chat-completions.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';
import { type CreateChatCompletionDto } from './dto/create-chat-completion.dto.js';

describe('ChatCompletionsService', () => {
  let service: ChatCompletionsService;

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

  const baseDto: CreateChatCompletionDto = {
    assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: false,
  };

  const closeMcpClients = jest.fn().mockResolvedValue(undefined);

  function createMockReq(): Request {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { headers: {} }) as unknown as Request;
  }

  function createMockRes() {
    const chunks: string[] = [];
    const res: Record<string, jest.Mock> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    res.write = jest.fn((c: string) => {
      chunks.push(c);
      return true;
    });
    res.end = jest.fn();
    return { res: res as unknown as Response, chunks };
  }

  function makeChain(overrides: {
    textStream?: AsyncIterable<string>;
    usage?: unknown;
  }) {
    function* defaultTextStream() {
      yield 'response';
    }
    const streamResult = {
      textStream: overrides.textStream ?? defaultTextStream(),
      usage:
        overrides.usage ??
        Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
    };
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

    service = new ChatCompletionsService(
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

  it('throws NotFoundException when the assistant/project is not found', async () => {
    prisma.client.project.findFirst.mockResolvedValue(null);
    const { res } = createMockRes();

    await expect(
      service.create(baseDto, mockContext, createMockReq(), res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(initializeBasicRag.initializeRagChain).not.toHaveBeenCalled();
  });

  it('throws a 429 HttpException when the monthly API request limit is exceeded', async () => {
    apiLimits.checkApiRequestLimit.mockResolvedValue({
      exceeded: true,
      current: 100,
      limit: 100,
    });
    const { res } = createMockRes();

    const promise = service.create(baseDto, mockContext, createMockReq(), res);
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ status: 429 });
    expect(initializeBasicRag.initializeRagChain).not.toHaveBeenCalled();
  });

  it('strips the asst- prefix from assistant_id when resolving the project', async () => {
    const { res } = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.create(
      { ...baseDto, assistant_id: 'asst-a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      mockContext,
      createMockReq(),
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

  it('returns an OpenAI chat.completion object for non-streaming requests and tracks usage', async () => {
    const { res } = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.create(baseDto, mockContext, createMockReq(), res);

    expect((res as any).status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body).toMatchObject({
      object: 'chat.completion',
      model: 'gpt-5.4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'response' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(aiUsage.track).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        step: 'CHAT_COMPLETION',
        provider: 'litellm',
        model: 'gpt-5.4',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      }),
    );
    expect(closeMcpClients).toHaveBeenCalledTimes(1);
  });

  it('applies model/temperature overrides on top of org defaults', async () => {
    const { res } = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.create(
      { ...baseDto, model: 'claude-opus-4-6', temperature: 0.1 },
      mockContext,
      createMockReq(),
      res,
    );

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          model: 'claude-opus-4-6',
          temperature: 0.1,
        }),
      }),
    );
  });

  it('passes max_tokens through as maxTokens', async () => {
    const { res } = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.create(
      { ...baseDto, max_tokens: 256 },
      mockContext,
      createMockReq(),
      res,
    );

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 256 }),
    );
  });

  it('folds a multi-turn messages array into question/chat_history and merges system prompts', async () => {
    const { res } = createMockRes();
    const chain = makeChain({});
    initializeBasicRag.initializeRagChain.mockResolvedValue(chain);

    await service.create(
      {
        ...baseDto,
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'first reply' },
          { role: 'user', content: 'second' },
        ],
      },
      mockContext,
      createMockReq(),
      res,
    );

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({
        projectInstruction: 'be nice\n\nBe concise.',
      }),
    );
    expect(chain.stream).toHaveBeenCalledWith({
      question: 'second',
      chat_history: 'USER: first\nASSISTANT: first reply',
    });
  });

  it('persists an API thread when the API key has debug mode enabled', async () => {
    const saveAssistantMessage = jest.fn().mockResolvedValue(undefined);
    persistApiThread.createApiThread.mockResolvedValue({
      threadId: 'thread-1',
      saveAssistantMessage,
    });
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const { res } = createMockRes();

    await service.create(
      baseDto,
      { ...mockContext, debugMode: true },
      createMockReq(),
      res,
    );

    expect(persistApiThread.createApiThread).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        userId: 'user-1',
        question: 'Hi',
      }),
    );
    expect(saveAssistantMessage).toHaveBeenCalledWith('response');
  });

  it('does not persist a thread when debug mode is off', async () => {
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const { res } = createMockRes();

    await service.create(baseDto, mockContext, createMockReq(), res);

    expect(persistApiThread.createApiThread).not.toHaveBeenCalled();
  });

  describe('streaming', () => {
    function* textStream(parts: string[]) {
      for (const p of parts) {
        yield p;
      }
    }

    it('emits an opening role chunk, content chunks, a finish chunk with no usage, and [DONE]', async () => {
      const { res, chunks } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(
        makeChain({ textStream: textStream(['Hello ', 'world']) }),
      );

      await service.create(
        { ...baseDto, stream: true },
        mockContext,
        createMockReq(),
        res,
      );

      expect(chunks[0]).toContain('"delta":{"role":"assistant"}');
      expect(
        chunks.some((c) => c.includes('"delta":{"content":"Hello "}')),
      ).toBe(true);
      expect(
        chunks.some((c) => c.includes('"delta":{"content":"world"}')),
      ).toBe(true);
      const final = chunks.find((c) => c.includes('"finish_reason":"stop"'));
      expect(final).toBeDefined();
      expect(final).not.toContain('"usage"');
      expect(chunks.every((c) => !c.includes('"choices":[]'))).toBe(true);
      expect(chunks[chunks.length - 1]).toBe('data: [DONE]\n\n');
      expect(closeMcpClients).toHaveBeenCalledTimes(1);
    });

    it('emits a dedicated usage chunk with choices:[] when stream_options.include_usage is true', async () => {
      const { res, chunks } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(
        makeChain({ textStream: textStream(['Hi']) }),
      );

      await service.create(
        {
          ...baseDto,
          stream: true,
          stream_options: { include_usage: true },
        },
        mockContext,
        createMockReq(),
        res,
      );

      const finish = chunks.find((c) => c.includes('"finish_reason":"stop"'));
      expect(finish).not.toContain('"usage"');

      const usageChunk = chunks.find((c) => c.includes('"choices":[]'));
      expect(usageChunk).toBeDefined();
      expect(usageChunk).toContain(
        '"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}',
      );

      const finishIdx = chunks.findIndex((c) =>
        c.includes('"finish_reason":"stop"'),
      );
      const usageIdx = chunks.findIndex((c) => c.includes('"choices":[]'));
      const doneIdx = chunks.findIndex((c) => c === 'data: [DONE]\n\n');
      expect(finishIdx).toBeLessThan(usageIdx);
      expect(usageIdx).toBeLessThan(doneIdx);
    });

    it('does not write a terminator after the response has already ended', async () => {
      const { res, chunks } = createMockRes();
      (res as unknown as { writableEnded: boolean }).writableEnded = true;
      initializeBasicRag.initializeRagChain.mockResolvedValue(
        makeChain({ textStream: textStream(['Hi']) }),
      );

      await service.create(
        { ...baseDto, stream: true },
        mockContext,
        createMockReq(),
        res,
      );

      expect(chunks.includes('data: [DONE]\n\n')).toBe(false);
    });

    it('sets SSE response headers', async () => {
      const { res } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(
        makeChain({ textStream: textStream([]) }),
      );

      await service.create(
        { ...baseDto, stream: true },
        mockContext,
        createMockReq(),
        res,
      );

      expect((res as any).setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream; charset=utf-8',
      );
      expect((res as any).setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-transform',
      );
      expect((res as any).flushHeaders).toHaveBeenCalled();
    });
  });

  it('closes MCP clients and rethrows when chain initialization throws (for OpenAiExceptionFilter to format)', async () => {
    initializeBasicRag.initializeRagChain.mockRejectedValue(new Error('boom'));
    const { res } = createMockRes();

    await expect(
      service.create(baseDto, mockContext, createMockReq(), res),
    ).rejects.toThrow('boom');
    expect(closeMcpClients).toHaveBeenCalledTimes(1);
  });
});
