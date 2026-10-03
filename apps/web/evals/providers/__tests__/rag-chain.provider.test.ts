import { beforeEach, describe, expect, it, vi } from 'vitest';

const basicRagChain = vi.hoisted(() =>
  vi.fn(async () => ({
    stream: async () => ({
      text: Promise.resolve('answer'),
      usage: Promise.resolve({}),
      retrieval: Promise.resolve(null),
    }),
  })),
);

vi.mock('@/libs/chains/basic-rag/chain', () => ({ basicRagChain }));
vi.mock('@/libs/llm/native-models', () => ({
  nativeChatInstance: vi.fn(() => ({ id: 'model' })),
}));

import { RagChainProvider } from '../rag-chain.provider';

const memoryBlockPassed = () => {
  const call = basicRagChain.mock.calls[0] as unknown as [
    { config: { memoryBlock?: string } },
  ];
  return call[0].config.memoryBlock;
};

describe('RagChainProvider memories (personal memory E1)', () => {
  beforeEach(() => {
    basicRagChain.mockClear();
  });

  it('passes the configured memories to the chain as the rendered <user_memory> block', async () => {
    const provider = new RagChainProvider({
      config: { memories: ['Prefers bullet points.', 'Is the CFO.'] },
    });

    await provider.callApi('question');

    const block = memoryBlockPassed();
    expect(block).toContain('<user_memory>');
    expect(block).toContain('- Prefers bullet points.');
    expect(block).toContain('- Is the CFO.');
  });

  it('passes no block when no memories are configured, as for a user without memories', async () => {
    const provider = new RagChainProvider({ config: {} });

    await provider.callApi('question');

    expect(memoryBlockPassed()).toBeFalsy();
  });
});
