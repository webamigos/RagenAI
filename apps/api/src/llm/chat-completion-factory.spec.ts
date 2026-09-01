// Stub the AI SDK before importing the factory — `createOpenAI` returns a
// callable that exposes `.chat()`. We capture the fetch hook so we can drive
// it directly without hitting the network.
const capturedFetches: Array<
  (url: string, init: RequestInit) => Promise<unknown>
> = [];

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (opts: {
    fetch: (url: string, init: RequestInit) => Promise<unknown>;
  }) => {
    capturedFetches.push(opts.fetch);
    const provider = (model: string) => ({ modelId: model });
    provider.chat = (model: string) => ({ modelId: model });
    return provider;
  },
}));

import { ChatCompletionFactory } from './chat-completion-factory.js';

describe('ChatCompletionFactory.createInstance', () => {
  const credentials = {
    provider: 'litellm' as const,
    baseUrl: 'http://localhost:4000',
    apiKey: 'sk-test',
  };

  beforeEach(() => {
    capturedFetches.length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function callFetchHook(
    model: string,
    body: Record<string, unknown>,
    reasoningEffort?: 'low' | 'medium' | 'high',
  ) {
    ChatCompletionFactory.createInstance(credentials, {
      model,
      reasoningEffort,
    });
    const hook = capturedFetches.at(-1)!;
    const realFetch = jest.fn().mockResolvedValue(new Response('{}'));
    jest.spyOn(globalThis, 'fetch').mockImplementation(realFetch);
    await hook('http://localhost:4000/v1/chat/completions', {
      body: JSON.stringify(body),
    });
    return JSON.parse(
      (realFetch.mock.calls[0]![1] as RequestInit).body as string,
    );
  }

  it('injects reasoning_effort and renames max_tokens for GPT-OSS', async () => {
    const sentBody = await callFetchHook(
      'gpt-oss-120b',
      { model: 'gpt-oss-120b', max_tokens: 2048, messages: [] },
      'medium',
    );

    expect(sentBody.reasoning_effort).toBe('medium');
    expect(sentBody.max_completion_tokens).toBe(2048);
    expect(sentBody.max_tokens).toBeUndefined();
  });

  it('does NOT inject reasoning_effort for non-supporting models', async () => {
    const sentBody = await callFetchHook(
      'gpt-5.4',
      { model: 'gpt-5.4', max_tokens: 1024, messages: [] },
      'high',
    );

    expect(sentBody.reasoning_effort).toBeUndefined();
    expect(sentBody.max_tokens).toBe(1024);
    expect(sentBody.max_completion_tokens).toBeUndefined();
  });

  it('passes through cleanly when reasoningEffort is unset', async () => {
    const sentBody = await callFetchHook(
      'gpt-oss-120b',
      { model: 'gpt-oss-120b', max_tokens: 1024, messages: [] },
      undefined,
    );

    expect(sentBody.reasoning_effort).toBeUndefined();
    expect(sentBody.max_tokens).toBe(1024);
  });
});
