import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeFor = vi.hoisted(() => vi.fn());
const availableModels = vi.hoisted(() => vi.fn(() => ['stub-chat']));
const createModerationInstance = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error(
      'Cannot create moderation instance: set OPENAI_MODERATION_KEY or OPENAI_API_KEY',
    );
  }),
);

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    gatewayFromEnv: () => ({ routeFor, availableModels }),
  };
});

vi.mock('../moderation-instance.js', () => ({ createModerationInstance }));

const basicRagChain = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ stream: vi.fn() })),
);
vi.mock('./chain.js', () => ({ basicRagChain }));

vi.mock('../../llm/model-instances.js', () => ({
  createChatCompletionInstance: vi.fn(() => ({ modelId: 'stub' })),
  createEmbeddingsInstance: vi.fn(() => ({})),
}));

const { InitializeBasicRagService } =
  await import('./initialize-basic-rag.service.js');

describe('InitializeBasicRagService', () => {
  let service: InstanceType<typeof InitializeBasicRagService>;

  function makeService() {
    const organizationSettings = {
      getRagPipelineSettings: vi.fn().mockResolvedValue({
        multiQueryEnabled: true,
        contentModerationEnabled: true,
        rerankingEnabled: false,
      }),
      getOrCreatePiiDek: vi.fn(),
    };
    const organizationMetadata = {
      get: vi.fn().mockResolvedValue({ vectorStore: 'qdrant' }),
    };
    const importedKbFileIds = { get: vi.fn().mockResolvedValue([]) };
    // An organization with no rules, which is what every installation has
    // until somebody enables one — so this suite keeps asserting the
    // unguarded path it was written for.
    const guardrails = {
      forOrganization: vi.fn().mockResolvedValue({
        input: [],
        output: [],
        hasTransformingInputRule: false,
        degraded: false,
      }),
    };
    const runGuardrails = { run: vi.fn() };

    return new InitializeBasicRagService(
      organizationSettings as never,
      organizationMetadata as never,
      importedKbFileIds as never,
      guardrails as never,
      runGuardrails as never,
    );
  }

  const params = {
    settings: {
      apiKey: 'sk-test',
      model: 'stub-chat',
      temperature: 0.7,
      prompt: '',
      maxDocumentsToRetrieve: 4,
    },
    orgId: 'org-1',
    userId: 'user-1',
  } as never;

  function withModel(model: string) {
    const base = params as unknown as { settings: Record<string, unknown> };
    return {
      ...(params as object),
      settings: { ...base.settings, model },
    } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    availableModels.mockReturnValue(['stub-chat', 'other-model']);
    // `resolveEmbeddingsModel()` reads EMBEDDINGS_MODEL, defaulting to
    // `bge-multilingual-gemma2` — route both it and the answer model, or every
    // case here fails on the embeddings guard rather than on its own subject.
    routeFor.mockImplementation((id: string) =>
      id === 'model-with-no-route'
        ? undefined
        : { provider: 'openai-compatible' },
    );
    service = makeService();
  });

  // The crash this guards: an unroutable model reaches `streamText`, the AI SDK
  // raises AI_NoOutputGeneratedError from a stream flush callback outside any
  // request-scoped catch, and Node exits. One request ended the service for
  // every caller.
  it('refuses an unroutable answer model with a 400 instead of building a chain', async () => {
    await expect(
      service.initializeRagChain(withModel('model-with-no-route')),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(basicRagChain).not.toHaveBeenCalled();
  });

  it('names the models it does serve, so the caller can correct the request', async () => {
    await expect(
      service.initializeRagChain(withModel('model-with-no-route')),
    ).rejects.toThrow(/stub-chat, other-model/);
  });

  // The second way an unroutable model ended the process, and the one the
  // answer-model guard alone did not close: `createEmbeddingsInstance` returns
  // a *promise* (`resolveEmbeddingModel` is async), so an unroutable
  // EMBEDDINGS_MODEL leaves a rejection nothing awaits once the request has
  // failed for another reason. Node exits on it — after the request was
  // correctly answered with a 500, which is what made it hard to attribute.
  it('refuses an unroutable embeddings model too', async () => {
    routeFor.mockImplementation((id: string) =>
      id === 'stub-chat' ? { provider: 'openai-compatible' } : undefined,
    );

    await expect(service.initializeRagChain(params)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(basicRagChain).not.toHaveBeenCalled();
  });

  // Moderation is off unless MODERATION_ENABLED=1, but the instance was built
  // unconditionally and throws without an OpenAI key — so a chat request on an
  // installation with no OpenAI credentials answered 500 over a disabled
  // feature.
  it('does not need an OpenAI key to build a chain when moderation is off', async () => {
    await expect(service.initializeRagChain(params)).resolves.toBeDefined();

    expect(createModerationInstance).not.toHaveBeenCalled();
  });

  it('hands the chain a factory rather than a moderation instance', async () => {
    await service.initializeRagChain(params);

    const lastCall = basicRagChain.mock.calls.at(-1) as
      [{ models: { contentModerator: unknown } }] | undefined;
    expect(lastCall).toBeDefined();
    expect(typeof lastCall?.[0].models.contentModerator).toBe('function');
  });
});
