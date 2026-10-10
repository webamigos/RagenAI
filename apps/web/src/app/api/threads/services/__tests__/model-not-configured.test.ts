import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingCredentialsError } from '@ragenai/llm-gateway';

// A thread whose model routes to a provider with no credentials. Everything
// the stream reads before the model is chosen is mocked to a passing turn;
// what is under test is that the refusal comes out as an `error` event, and
// that nothing after it — the stored message, retrieval, the chain — runs.

const resolveModel = vi.hoisted(() => vi.fn());
vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return { ...actual, gatewayFromEnv: () => ({ resolveModel }) };
});

vi.mock('@langfuse/tracing', () => ({
  observe: (fn: unknown) => fn,
  updateActiveTrace: vi.fn(),
}));
vi.mock('@/generated/prisma/client', () => ({
  Role: { ASSISTANT: 'ASSISTANT' },
  Source: { UI: 'UI' },
  AiUsageStep: { CHAT_COMPLETION: 'CHAT_COMPLETION' },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: {} }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock(
  '@/features/ai-usage/services/commands/create-ai-usage-command',
  () => ({
    trackAiUsage: vi.fn(),
  }),
);
vi.mock('@/features/threads/services/queries/get-thread-details-query', () => ({
  getThreadDetailsQuery: vi.fn().mockResolvedValue({
    id: 'thread-1',
    preferredModel: 'gemini-3-flash-preview',
    projectId: null,
    project: null,
    messages: [],
  }),
}));
vi.mock('@/features/messages/services/commands/create-message-command', () => ({
  createAndStoreMessageCommand: vi.fn(),
  createMessageInDbCommand: vi.fn(),
}));
vi.mock('../initializeBasicRag', () => ({ initializeRagChain: vi.fn() }));
vi.mock('../initializeConversationChain', () => ({
  initializeConversationChain: vi.fn(),
}));
vi.mock(
  '../../guest-threads/[...guestDetails]/services/initializePublicBasicRag',
  () => ({ initializePublicRagChain: vi.fn() }),
);
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getAllSettings: vi.fn().mockResolvedValue({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    prompt: '',
    maxDocumentsToRetrieve: 5,
  }),
  getPublicChatModel: vi.fn().mockResolvedValue(null),
}));
vi.mock(
  '@/features/projects/services/queries/get-project-instruction-query',
  () => ({
    getProjectInstructionQuery: vi.fn(),
  }),
);
vi.mock(
  '@/features/assistant-templates/services/queries/get-template-instruction-query',
  () => ({ getTemplateInstructionForProject: vi.fn() }),
);
vi.mock(
  '@/features/documents/services/commands/record-knowledge-usage-command',
  () => ({ recordKnowledgeUsageCommand: vi.fn() }),
);
vi.mock(
  '@/features/memory/services/commands/enqueue-memory-extraction-command',
  () => ({ enqueueMemoryExtractionCommand: vi.fn() }),
);
vi.mock(
  '@/features/memory/services/queries/get-memory-block-for-turn-query',
  () => ({
    getMemoryBlockForTurnQuery: vi.fn(),
  }),
);
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
}));
vi.mock('@/app/components/config', () => ({
  getModelProvider: vi.fn(),
  normalizeModelId: (id: string) => id,
  DEEP_THINKING_DEFAULT_MODEL: 'gpt-oss-120b',
  supportsReasoningEffort: () => false,
}));
vi.mock(
  '@/features/connectors/services/queries/get-enabled-connectors-query',
  () => ({
    getEnabledConnectorsQuery: vi.fn(),
  }),
);
vi.mock('@/libs/mcp/client', () => ({
  createMcpToolsFromConnectors: vi.fn(),
  applyPiiUnmaskToTools: vi.fn(),
}));
vi.mock('@/libs/mcp/provider-instructions', () => ({
  buildMcpContext: vi.fn(),
}));
vi.mock(
  '@/features/projects/services/queries/get-project-mcp-providers-query',
  () => ({
    getProjectMcpProvidersQuery: vi.fn(),
  }),
);
vi.mock(
  '@/features/connectors/services/queries/get-available-connectors-query',
  () => ({ getAvailableConnectorsForOrg: vi.fn() }),
);
vi.mock(
  '@/features/ai-usage/services/queries/check-usage-limits-query',
  () => ({
    checkUsageLimitsQuery: vi.fn().mockResolvedValue({
      exceeded: {
        tokens: false,
        cost: false,
        messages: false,
        apiRequests: false,
      },
    }),
  }),
);
vi.mock('@/features/teams/utils/active-team-cookie', () => ({
  getActiveTeamIdFromCookie: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/features/teams/services/queries/resolve-usage-team-query', () => ({
  resolveUsageTeamQuery: vi.fn().mockResolvedValue(null),
}));
vi.mock(
  '@/features/teams/services/queries/check-team-rate-limit-query',
  () => ({
    assertWithinTeamRateLimit: vi.fn().mockResolvedValue(undefined),
  }),
);
vi.mock('@/lib/auth-guards', () => ({
  getSession: vi.fn(),
  getUserTeamIds: vi.fn(),
  getActiveMember: vi.fn(),
}));
vi.mock('@/lib/auth-access-control', () => ({ orgVisibilityScope: vi.fn() }));
vi.mock('@/libs/tools', () => ({
  createBuiltInTools: vi.fn(),
  getBuiltInToolsContext: vi.fn(),
}));
vi.mock('@ragenai/crypto', () => ({ isEncryptionEnabled: () => false }));
vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({ recordSecurityEvent: vi.fn() }),
);
vi.mock('@/features/guardrails/utils/answer-to-persist', () => ({
  answerToPersist: vi.fn(),
}));
vi.mock('@/libs/pii/stream-unmasker', () => ({ StreamUnmasker: vi.fn() }));
vi.mock('@/libs/pii/pii-system-instruction', () => ({
  withPiiSystemInstruction: vi.fn(),
}));
vi.mock('@/libs/pii/anonymize-with-security-events', () => ({
  anonymizeWithSecurityEvents: vi.fn(),
}));
vi.mock('@/libs/pii/masking-language', () => ({ PII_MASKING_LANGUAGE: 'en' }));
vi.mock('@/features/connectors/utils/provider-icons', () => ({
  connectorIconUrl: vi.fn(),
}));
vi.mock('@/features/threads/utils/retrieval-event', () => ({
  toRetrievalEvent: vi.fn(),
}));
vi.mock('@/config/public-runtime-config', () => ({
  readPublicRuntimeConfig: () => ({ hideModelSelector: '0' }),
}));

import { createAndStoreMessageCommand } from '@/features/messages/services/commands/create-message-command';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import { ChatType } from '@/features/messages/contracts/message.types';
import { logger } from '@/app/lib/utils/logger';

import { initializeRagChain } from '../initializeBasicRag';
import { streamEvents } from '../assistant-stream';

/** Every SSE event the stream emitted, parsed. */
async function eventsOf(
  stream: ReadableStream,
): Promise<{ event: string; data: Record<string, unknown> | undefined }[]> {
  const text = await new Response(stream).text();
  return text
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

type UserMessage = Parameters<typeof streamEvents>[0]['userMessage'];

function turn(userMessage: Partial<UserMessage> = {}) {
  return streamEvents({
    publicThreadId: 'thread-1',
    userMessage: {
      prompt: 'What is in my documents?',
      ...userMessage,
    } as UserMessage,
    orgId: 'org-1',
    mode: AssistantMode.INTERNAL,
    filteredMode: ChatType.RAG,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a turn whose model has no provider credentials', () => {
  beforeEach(() => {
    resolveModel.mockRejectedValue(
      new MissingCredentialsError('vertex', [
        'VERTEX_PROJECT',
        'VERTEX_LOCATION',
      ]),
    );
  });

  it('tells the reader, with the code the client translates and the fix for an admin', async () => {
    const events = await eventsOf(await turn());

    const error = events.find((e) => e.event === 'error');
    expect(error?.data).toMatchObject({
      type: 'error',
      code: 'model-not-configured',
      originalErrorMessage:
        'gemini-3-flash-preview: no credentials for vertex: set VERTEX_PROJECT, VERTEX_LOCATION',
    });
  });

  it('refuses before the message is stored or retrieval runs', async () => {
    await eventsOf(await turn());

    expect(resolveModel).toHaveBeenCalledWith('gemini-3-flash-preview', {
      scope: { organizationId: 'org-1' },
    });
    expect(createAndStoreMessageCommand).not.toHaveBeenCalled();
    expect(initializeRagChain).not.toHaveBeenCalled();
  });

  it('logs a warning rather than an unexplained SSE failure', async () => {
    await eventsOf(await turn());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1' }),
      expect.stringContaining('not configured'),
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'Error processing SSE',
    );
  });
});

describe('a turn whose model is configured', () => {
  it('goes on to store the message', async () => {
    resolveModel.mockResolvedValue({ id: 'model' });
    // Stops the turn right after the preflight, at the next step it takes.
    vi.mocked(createAndStoreMessageCommand).mockRejectedValue(
      new Error('stop here'),
    );

    const events = await eventsOf(await turn());

    expect(createAndStoreMessageCommand).toHaveBeenCalled();
    expect(
      events.some(
        (e) => e.event === 'error' && e.data?.code === 'model-not-configured',
      ),
    ).toBe(false);
  });
});

describe('a turn with an image on a text-only model', () => {
  beforeEach(() => {
    vi.stubEnv('MULTIMODAL_TEXT_ONLY_MODELS', 'gemini-3-flash-preview');
    vi.stubEnv('MULTIMODAL_FALLBACK_MODEL', 'gpt-4o');
    resolveModel.mockImplementation(async (modelId: string) => {
      if (modelId === 'gpt-4o') {
        throw new MissingCredentialsError('openai', ['OPENAI_API_KEY']);
      }
      return { id: modelId };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resolveModel.mockReset();
  });

  it('checks the vision fallback the chain will call, not the thread model', async () => {
    const events = await eventsOf(
      await turn({
        threadDocuments: [
          {
            name: 'chart.png',
            content: '',
            size: 10,
            type: 'image/png',
            imageData: 'data:image/png;base64,AAAA',
          },
        ],
      }),
    );

    expect(resolveModel).toHaveBeenCalledWith('gpt-4o', expect.anything());
    expect(events.find((e) => e.event === 'error')?.data).toMatchObject({
      code: 'model-not-configured',
      originalErrorMessage:
        'gpt-4o: no credentials for openai: set OPENAI_API_KEY',
    });
    expect(createAndStoreMessageCommand).not.toHaveBeenCalled();
  });

  it('checks the thread model when the turn carries no image', async () => {
    vi.mocked(createAndStoreMessageCommand).mockRejectedValue(
      new Error('stop here'),
    );

    await eventsOf(await turn());

    expect(resolveModel).toHaveBeenCalledWith(
      'gemini-3-flash-preview',
      expect.anything(),
    );
    expect(resolveModel).not.toHaveBeenCalledWith('gpt-4o', expect.anything());
  });
});
