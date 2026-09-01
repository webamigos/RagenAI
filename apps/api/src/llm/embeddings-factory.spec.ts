const mockEmbed = jest.fn();
const mockEmbedMany = jest.fn();

jest.mock('ai', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

import { TrackedEmbeddingsProvider } from './embeddings-factory.js';

describe('TrackedEmbeddingsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('embeds a single query and reports usage via the callback', async () => {
    mockEmbed.mockResolvedValue({
      embedding: [0.1, 0.2],
      usage: { tokens: 7 },
    });
    const trackAiUsage = jest.fn().mockResolvedValue(undefined);

    const provider = new TrackedEmbeddingsProvider(
      'fake-model',
      'cohere-embed-multilingual-v3',
      'litellm',
      'org-1',
      'user-1',
      'proj-1',
      trackAiUsage,
    );

    const result = await provider.embedQuery('hello');

    expect(result).toEqual([0.1, 0.2]);
    expect(trackAiUsage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
      step: 'EMBEDDINGS',
      provider: 'litellm',
      model: 'cohere-embed-multilingual-v3',
      inputTokens: 7,
      outputTokens: 0,
      totalTokens: 7,
    });
  });

  it('embeds many documents and reports usage once', async () => {
    mockEmbedMany.mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      usage: { tokens: 20 },
    });
    const trackAiUsage = jest.fn().mockResolvedValue(undefined);

    const provider = new TrackedEmbeddingsProvider(
      'fake-model',
      'cohere-embed-multilingual-v3',
      'litellm',
      'org-1',
      undefined,
      undefined,
      trackAiUsage,
    );

    const result = await provider.embedDocuments(['a', 'b']);

    expect(result).toHaveLength(2);
    expect(trackAiUsage).toHaveBeenCalledTimes(1);
  });

  it('does not track usage when organizationId is missing', async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.1], usage: { tokens: 3 } });
    const trackAiUsage = jest.fn();

    const provider = new TrackedEmbeddingsProvider(
      'fake-model',
      'cohere-embed-multilingual-v3',
      'litellm',
      undefined,
      undefined,
      undefined,
      trackAiUsage,
    );

    await provider.embedQuery('hello');

    expect(trackAiUsage).not.toHaveBeenCalled();
  });

  it('does not track usage when no callback was provided', async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.1], usage: { tokens: 3 } });

    const provider = new TrackedEmbeddingsProvider(
      'fake-model',
      'cohere-embed-multilingual-v3',
      'litellm',
      'org-1',
    );

    await expect(provider.embedQuery('hello')).resolves.toEqual([0.1]);
  });
});
