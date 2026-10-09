import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockModerationsCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return {
      moderations: {
        create: (...args: unknown[]) => mockModerationsCreate(...args),
      },
    };
  }),
}));

import { createModerationInstance } from '../llm';

/**
 * An installation whose model provider is not OpenAI has no moderation key,
 * and every chain initializer builds the moderator eagerly. This used to throw
 * there, so the Railway template — one `OPENROUTER_API_KEY` — could not hold a
 * conversation at all. `undefined` is what the guardrail evaluator already
 * reads as "moderation enabled but not configured".
 */
describe('createModerationInstance', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OPENAI_MODERATION_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns undefined instead of throwing when no key is configured', () => {
    expect(() => createModerationInstance()).not.toThrow();
    expect(createModerationInstance()).toBeUndefined();
  });

  it('builds a moderator from the organization key, the moderation key or the OpenAI key', () => {
    expect(createModerationInstance('org-key')).toBeDefined();

    process.env.OPENAI_MODERATION_KEY = 'moderation-key';
    expect(createModerationInstance()).toBeDefined();

    delete process.env.OPENAI_MODERATION_KEY;
    process.env.OPENAI_API_KEY = 'api-key';
    expect(createModerationInstance()).toBeDefined();
  });

  it('maps the provider response to ModerationResult[]', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { hate: true } }],
    });

    const result = await createModerationInstance('org-key')!.invoke({
      input: 'text',
    });

    expect(mockModerationsCreate).toHaveBeenCalledWith({ input: 'text' });
    expect(result.results).toEqual([
      { flagged: true, categories: { hate: true } },
    ]);
  });
});
