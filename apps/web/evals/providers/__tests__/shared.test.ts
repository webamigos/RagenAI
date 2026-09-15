import { describe, expect, it, vi } from 'vitest';

const nativeChatInstance = vi.hoisted(() => vi.fn(() => ({ id: 'model' })));

vi.mock('@/libs/llm/native-models', () => ({ nativeChatInstance }));

import { evalChatModel } from '../shared';

describe('evalChatModel', () => {
  /**
   * The point of the helper is *which* path the evals take. Before B6 they
   * built a proxy client from `LITELLM_PROXY_URL`, which meant a suite could
   * pass against a code path the product no longer used. This asserts the
   * model id reaches the gateway the application itself calls.
   */
  it('resolves the model through the gateway the product uses', () => {
    evalChatModel('gemini-2.5-flash');

    expect(nativeChatInstance).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-flash' }),
    );
  });
});
