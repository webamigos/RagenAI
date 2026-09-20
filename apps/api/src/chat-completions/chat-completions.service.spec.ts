/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import type { Mock } from 'vitest';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';
import { ForbiddenException, HttpException } from '@nestjs/common';
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

  let prisma: { client: { project: { findFirst: Mock } } };
  let apiLimits: {
    checkApiRequestLimit: Mock;
    checkUsageCeilings: Mock;
  };
  let organizationSettings: { getAllSettings: Mock };
  let loadMcpTools: { loadMcpToolsForApiRequest: Mock };
  let initializeBasicRag: { initializeRagChain: Mock };
  let persistApiThread: { createApiThread: Mock };
  let aiUsage: { track: Mock };
  let teamRateLimit: {
    resolveUsageTeam: Mock;
    check: Mock;
    assertWithinLimit: Mock;
    charge: Mock;
  };
  let folders: { getMembershipContext: Mock };

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

  const closeMcpClients = vi.fn().mockResolvedValue(undefined);

  function createMockReq(): Request {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { headers: {} }) as unknown as Request;
  }

  function createMockRes() {
    const chunks: string[] = [];
    const res: Record<string, Mock> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn();
    res.flushHeaders = vi.fn();
    res.write = vi.fn((c: string) => {
      chunks.push(c);
      return true;
    });
    res.end = vi.fn();
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
    return { stream: vi.fn().mockResolvedValue(streamResult) };
  }

  beforeEach(() => {
    prisma = { client: { project: { findFirst: vi.fn() } } };
    apiLimits = {
      checkApiRequestLimit: vi.fn(),
      checkUsageCeilings: vi.fn(),
    };
    // Under every ceiling unless a test says otherwise.
    apiLimits.checkUsageCeilings.mockResolvedValue({
      exceeded: [],
      current: { totalTokens: 0, totalCostCents: 0, totalMessages: 0 },
      limits: {
        monthlyTokenLimit: null,
        monthlyCostLimitCents: null,
        monthlyMessageLimit: null,
      },
    });
    organizationSettings = { getAllSettings: vi.fn() };
    loadMcpTools = { loadMcpToolsForApiRequest: vi.fn() };
    initializeBasicRag = { initializeRagChain: vi.fn() };
    persistApiThread = { createApiThread: vi.fn() };
    aiUsage = { track: vi.fn().mockResolvedValue(undefined) };
    // Allows by default: the existing cases are about other things, and a
    // limiter that refused would change every one of them.
    teamRateLimit = {
      resolveUsageTeam: vi.fn().mockResolvedValue(null),
      check: vi.fn().mockResolvedValue({ ok: true }),
      assertWithinLimit: vi.fn().mockResolvedValue(undefined),
      charge: vi.fn().mockResolvedValue(undefined),
    };
    // An owner by default, which is what `orgVisibilityScope('owner')`
    // returns and what the existing cases assume they can see.
    folders = {
      getMembershipContext: vi
        .fn()
        .mockResolvedValue({ scope: 'organization', userTeamIds: [] }),
    };

    // `id` matters now: with no key scope the resolver looks the project up
    // and returns the row's own id, rather than echoing what was asked for.
    prisma.client.project.findFirst.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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
      loadMcpTools as any,
      initializeBasicRag as any,
      persistApiThread as any,
      aiUsage as any,
      teamRateLimit as any,
      new AssistantScopeService(prisma as any),
      // Resolves the caller's visibility scope. Without it the chain falls
      // back to `member` and retrieval matches nothing — see
      // `computeAccessiblePrincipals` in @ragenai/rag-core.
      folders as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses an assistant the caller cannot reach', async () => {
    prisma.client.project.findFirst.mockResolvedValue(null);
    const { res } = createMockRes();

    // 403, not the 404 this endpoint used to answer: the question under a key
    // scope is whether this caller may ask, and 404 vs 403 would report
    // whether the assistant exists.
    await expect(
      service.create(baseDto, mockContext, createMockReq(), res),
    ).rejects.toBeInstanceOf(ForbiddenException);
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

  it('throws a 429 naming the ceilings when a usage ceiling is exceeded', async () => {
    apiLimits.checkUsageCeilings.mockResolvedValue({
      exceeded: ['tokens', 'cost'],
      current: { totalTokens: 2000, totalCostCents: 600, totalMessages: 2 },
      limits: {
        monthlyTokenLimit: 1000,
        monthlyCostLimitCents: 500,
        monthlyMessageLimit: null,
      },
    });
    const { res } = createMockRes();

    const promise = service.create(baseDto, mockContext, createMockReq(), res);
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({
      status: 429,
      response: {
        error: 'Monthly usage limit exceeded',
        exceeded: ['tokens', 'cost'],
      },
    });
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
    const body = (res.json as Mock).mock.calls[0][0];
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

  // The defect this guards: the chain defaults to `scope: 'member'`, and
  // `buildMetadataFilter` then demands `metadata.accessible_by`. Omitting the
  // caller's real scope does not narrow retrieval, it empties it — and
  // silently, because an empty retrieval is a normal RAG outcome. `/v1/search`
  // resolved membership and this surface did not, so the same key answered one
  // and not the other.
  it("passes the caller's visibility scope and team ids to the chain", async () => {
    folders.getMembershipContext.mockResolvedValue({
      scope: 'member',
      userTeamIds: ['team-7', 'team-9'],
    });
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const { res } = createMockRes();

    await service.create(baseDto, mockContext, createMockReq(), res);

    expect(folders.getMembershipContext).toHaveBeenCalledWith(
      mockContext.orgId,
      mockContext.userId,
    );
    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'member',
        userTeamIds: ['team-7', 'team-9'],
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

  it('accepts max_completion_tokens as an alias for max_tokens', async () => {
    const { res } = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.create(
      { ...baseDto, max_completion_tokens: 512 },
      mockContext,
      createMockReq(),
      res,
    );

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 512 }),
    );
  });

  it('prefers max_tokens when a caller sends both spellings', async () => {
    const { res } = createMockRes();
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

    await service.create(
      { ...baseDto, max_tokens: 256, max_completion_tokens: 512 },
      mockContext,
      createMockReq(),
      res,
    );

    expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 256 }),
    );
  });

  describe('reasoning_effort', () => {
    it('forwards an explicit value to the chain', async () => {
      const { res } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

      await service.create(
        { ...baseDto, reasoning_effort: 'low' },
        mockContext,
        createMockReq(),
        res,
      );

      expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'low' }),
      );
    });

    it("defaults to 'medium' on a reasoning-capable model", async () => {
      const { res } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

      await service.create(
        { ...baseDto, model: 'gpt-oss-120b' },
        mockContext,
        createMockReq(),
        res,
      );

      expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'medium' }),
      );
    });

    // LiteLLM errors on the param for models that don't declare it, so
    // "unset" has to stay unset rather than defaulting to a value.
    it('stays undefined on a model without reasoning support', async () => {
      const { res } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

      await service.create(baseDto, mockContext, createMockReq(), res);

      expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: undefined }),
      );
    });

    it('honors an explicit value over the reasoning-capable default', async () => {
      const { res } = createMockRes();
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));

      await service.create(
        { ...baseDto, model: 'gpt-oss-120b', reasoning_effort: 'high' },
        mockContext,
        createMockReq(),
        res,
      );

      expect(initializeBasicRag.initializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'high' }),
      );
    });
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
    const saveAssistantMessage = vi.fn().mockResolvedValue(undefined);
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
    // `null` for the guardrail marker, and asserted rather than ignored: the
    // second argument is what tells a stored refusal from an answer, so a
    // turn nothing refused has to say so explicitly.
    expect(saveAssistantMessage).toHaveBeenCalledWith('response', null);
  });

  it('does not persist a thread when debug mode is off', async () => {
    initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
    const { res } = createMockRes();

    await service.create(baseDto, mockContext, createMockReq(), res);

    expect(persistApiThread.createApiThread).not.toHaveBeenCalled();
  });

  describe('streaming', () => {
    // The service consumes this with `for await`, so the helper has to be an
    // async generator — a sync one is not an AsyncIterable.
    // An async generator is how you produce an AsyncIterable of known values:
    // there is nothing to await, and the service needs `for await` to accept
    // it. The directive has to sit on the line directly above the function.
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* textStream(parts: string[]) {
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

  describe('per-team rate limiting', () => {
    /**
     * The gap this closes: apps/api ported the orchestration instead of proxying,
     * so when B5 removed the LiteLLM virtual keys the only enforcement on this
     * surface went with them — while the limit stayed visible in team settings.
     */
    it('charges the limit before any model work', async () => {
      teamRateLimit.resolveUsageTeam.mockResolvedValue('team-1');
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
      const { res } = createMockRes();

      await service.create(baseDto, mockContext, createMockReq(), res);

      expect(teamRateLimit.assertWithinLimit).toHaveBeenCalledWith('team-1');
    });

    it('refuses without running the chain when the team is over', async () => {
      teamRateLimit.resolveUsageTeam.mockResolvedValue('team-1');
      teamRateLimit.assertWithinLimit.mockRejectedValue(
        new HttpException({ code: 429, scope: 'rpm' }, 429),
      );
      const { res } = createMockRes();

      const promise = service.create(
        baseDto,
        mockContext,
        createMockReq(),
        res,
      );
      await expect(promise).rejects.toBeInstanceOf(HttpException);
      await expect(promise).rejects.toMatchObject({ status: 429 });
      expect(initializeBasicRag.initializeRagChain).not.toHaveBeenCalled();
    });

    /**
     * Without this the caller's team never reaches the limiter, so anyone in
     * more than one team resolved to `null` — and `null` is not rate limited at
     * all. The header is unvalidated at the guard on purpose; membership is
     * checked inside `resolveUsageTeam`.
     */
    it('passes the caller-claimed team through to be validated', async () => {
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
      const { res } = createMockRes();

      await service.create(
        baseDto,
        { ...mockContext, teamId: 'team-claimed' },
        createMockReq(),
        res,
      );

      expect(teamRateLimit.resolveUsageTeam).toHaveBeenCalledWith(
        expect.objectContaining({ activeTeamId: 'team-claimed' }),
      );
    });

    it('charges the real token count once the turn is done', async () => {
      teamRateLimit.resolveUsageTeam.mockResolvedValue('team-1');
      initializeBasicRag.initializeRagChain.mockResolvedValue(makeChain({}));
      const { res } = createMockRes();

      await service.create(baseDto, mockContext, createMockReq(), res);

      expect(teamRateLimit.charge).toHaveBeenCalledWith('team-1', 15);
    });
  });
});
