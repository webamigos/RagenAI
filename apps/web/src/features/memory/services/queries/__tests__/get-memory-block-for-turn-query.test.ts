import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  owner: vi.fn(),
  state: vi.fn(),
  list: vi.fn(),
  thread: vi.fn(),
  featureOn: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../memory-scope', () => ({
  memoryOwnerFromSession: () => m.owner(),
  getExtractionState: (...a: unknown[]) => m.state(...a),
  listMemories: (...a: unknown[]) => m.list(...a),
}));
vi.mock('../get-memory-gate-thread-query', () => ({
  getMemoryGateThreadQuery: (...a: unknown[]) => m.thread(...a),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: (...a: unknown[]) => m.featureOn(...a) }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: m.warn, error: vi.fn(), info: vi.fn() },
}));

import { getMemoryBlockForTurnQuery } from '../get-memory-block-for-turn-query';

const privateThread = {
  kind: 'CHAT',
  source: 'UI',
  chatbotId: null,
  visitorId: 'user-1',
  teamId: null,
  shareCount: 0,
  hasPublicLink: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.owner.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1' });
  m.thread.mockResolvedValue(privateThread);
  m.featureOn.mockResolvedValue(true);
  m.state.mockResolvedValue({ extractionEnabled: true, epoch: 0 });
  m.list.mockResolvedValue([{ content: 'Prefers bullet points.' }]);
});

const turn = { orgId: 'org-1', threadId: 'thread-1' };

describe('getMemoryBlockForTurnQuery', () => {
  it('renders the owner’s memories in their own private thread', async () => {
    expect(await getMemoryBlockForTurnQuery(turn)).toContain(
      '- Prefers bullet points.',
    );
    expect(m.thread).toHaveBeenCalledWith('thread-1', 'org-1');
  });

  it.each([
    ['a shared thread', { shareCount: 1 }],
    ['a team thread', { teamId: 'team-1' }],
    ['a thread with a public link', { hasPublicLink: true }],
    ['someone else’s thread', { visitorId: 'user-2' }],
  ])('adds no block in %s, and reads no memory', async (_case, change) => {
    m.thread.mockResolvedValue({ ...privateThread, ...change });
    expect(await getMemoryBlockForTurnQuery(turn)).toBe('');
    expect(m.list).not.toHaveBeenCalled();
  });

  it('adds no block while the key or the user’s switch is off', async () => {
    m.featureOn.mockResolvedValueOnce(false);
    expect(await getMemoryBlockForTurnQuery(turn)).toBe('');
    m.state.mockResolvedValueOnce({ extractionEnabled: false, epoch: 1 });
    expect(await getMemoryBlockForTurnQuery(turn)).toBe('');
    expect(m.list).not.toHaveBeenCalled();
  });

  it('adds no block when the session belongs to another organization', async () => {
    m.owner.mockResolvedValue({ organizationId: 'org-2', userId: 'user-1' });
    expect(await getMemoryBlockForTurnQuery(turn)).toBe('');
    expect(m.thread).not.toHaveBeenCalled();
  });

  it('runs the turn without memory when the memories cannot be read, logging no content', async () => {
    m.list.mockRejectedValue(
      new Error('the key for Prefers bullet points is gone'),
    );
    expect(await getMemoryBlockForTurnQuery(turn)).toBe('');
    expect(JSON.stringify(m.warn.mock.calls)).not.toContain('bullet');
  });

  it('is empty when there is nothing remembered', async () => {
    m.list.mockResolvedValue([]);
    expect(await getMemoryBlockForTurnQuery(turn)).toBe('');
  });
});
