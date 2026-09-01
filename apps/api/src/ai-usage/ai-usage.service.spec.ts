import { AiUsageService } from './ai-usage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AiUsageService', () => {
  function makeService(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const aiUsageOps = {
      create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      ...overrides,
    };
    const prisma = {
      client: { aiUsage: aiUsageOps },
    } as unknown as PrismaService;
    return { service: new AiUsageService(prisma), aiUsageOps };
  }

  it('records usage with the provided token counts and an inferred cost', async () => {
    const { service, aiUsageOps } = makeService();

    await service.track({
      organizationId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
      threadId: 'thread-1',
      step: 'CHAT_COMPLETION',
      provider: 'litellm',
      model: 'gpt-5.4',
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      totalTokens: 1_500_000,
    });

    expect(aiUsageOps.create).toHaveBeenCalledTimes(1);
    const data = aiUsageOps.create.mock.calls[0][0].data;
    expect(data.organization).toEqual({ connect: { id: 'org-1' } });
    expect(data.project).toEqual({ connect: { id: 'proj-1' } });
    expect(data.user).toEqual({ connect: { id: 'user-1' } });
    expect(data.threadId).toBe('thread-1');
    expect(data.step).toBe('CHAT_COMPLETION');
    expect(data.inputTokens).toBe(1_000_000);
    expect(data.outputTokens).toBe(500_000);
    expect(data.totalTokens).toBe(1_500_000);
    expect(data.estimatedCost).toBe(6); // 1M@$2 + 0.5M@$8
  });

  it('respects an explicit estimatedCost instead of recalculating', async () => {
    const { service, aiUsageOps } = makeService();

    await service.track({
      organizationId: 'org-1',
      step: 'EMBEDDINGS',
      provider: 'litellm',
      model: 'cohere-embed-multilingual-v3',
      inputTokens: 100,
      outputTokens: 0,
      totalTokens: 100,
      estimatedCost: 42,
    });

    expect(aiUsageOps.create.mock.calls[0][0].data.estimatedCost).toBe(42);
  });

  it('omits project/user connect blocks when not provided', async () => {
    const { service, aiUsageOps } = makeService();

    await service.track({
      organizationId: 'org-1',
      step: 'RERANKING',
      provider: 'scaleway',
      model: 'qwen3-embedding-8b',
      inputTokens: 10,
      outputTokens: 0,
      totalTokens: 10,
    });

    const data = aiUsageOps.create.mock.calls[0][0].data;
    expect(data.project).toBeUndefined();
    expect(data.user).toBeUndefined();
  });

  it('swallows a DB error instead of throwing', async () => {
    const { service } = makeService({
      create: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(
      service.track({
        organizationId: 'org-1',
        step: 'MODERATION',
        provider: 'litellm',
        model: 'gpt-5.4',
        inputTokens: 1,
        outputTokens: 0,
        totalTokens: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
