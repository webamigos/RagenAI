import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  threadFind: vi.fn(),
  featureOn: vi.fn(),
  owner: vi.fn(),
  state: vi.fn(),
  start: vi.fn(),
  encrypt: vi.fn(),
  encryptionOn: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: { thread: { findFirst: (...a: unknown[]) => m.threadFind(...a) } },
}));
vi.mock('@ragenai/crypto', () => ({
  isEncryptionEnabled: () => m.encryptionOn(),
}));
vi.mock('@/libs/jobs', () => ({ jobs: () => ({ start: m.start }) }));
vi.mock('@/features/messages/services/thread-content-encryption', () => ({
  maybeEncryptContent: (...a: unknown[]) => m.encrypt(...a),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: (...a: unknown[]) => m.featureOn(...a) }),
);
vi.mock('../../memory-scope', () => ({
  memoryOwnerFromSession: () => m.owner(),
  getExtractionState: (...a: unknown[]) => m.state(...a),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: m.warn, error: vi.fn(), info: vi.fn() },
}));

import { enqueueMemoryExtractionCommand } from '../enqueue-memory-extraction-command';

const INPUT = {
  orgId: 'org-1',
  threadId: 'thread-1',
  messageId: 'msg-1',
  maskedQuestion: 'I am the CFO.',
  turnRefused: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.owner.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1' });
  m.threadFind.mockResolvedValue({
    kind: 'CHAT',
    source: 'UI',
    chatbotId: null,
    visitorId: 'user-1',
    teamId: null,
    publicLink: null,
    _count: { shares: 0 },
  });
  m.featureOn.mockResolvedValue(true);
  m.state.mockResolvedValue({ extractionEnabled: true, epoch: 3 });
  m.encrypt.mockResolvedValue('ciphertext');
  m.encryptionOn.mockReturnValue(true);
  m.start.mockResolvedValue(undefined);
});

describe('enqueueMemoryExtractionCommand', () => {
  it('starts one job per turn with the encrypted question and the current epoch', async () => {
    await enqueueMemoryExtractionCommand(INPUT);

    expect(m.encrypt).toHaveBeenCalledWith(
      { threadId: 'thread-1', organizationId: 'org-1' },
      'I am the CFO.',
    );
    expect(m.start).toHaveBeenCalledWith('memoryExtract', 'memory-msg-1', {
      orgId: 'org-1',
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'msg-1',
      epoch: 3,
      question: 'ciphertext',
      questionEncrypted: true,
    });
  });

  it('reads the thread under the organization', async () => {
    await enqueueMemoryExtractionCommand(INPUT);
    expect(m.threadFind.mock.calls[0][0].where).toEqual({
      id: 'thread-1',
      organizationId: 'org-1',
    });
  });

  it('starts nothing for a thread shared with someone', async () => {
    m.threadFind.mockResolvedValue({
      kind: 'CHAT',
      source: 'UI',
      chatbotId: null,
      visitorId: 'user-1',
      teamId: null,
      publicLink: null,
      _count: { shares: 2 },
    });
    await enqueueMemoryExtractionCommand(INPUT);
    expect(m.start).not.toHaveBeenCalled();
    expect(m.encrypt).not.toHaveBeenCalled();
  });

  it('starts nothing when the session belongs to another organization', async () => {
    m.owner.mockResolvedValue({ organizationId: 'org-2', userId: 'user-1' });
    await enqueueMemoryExtractionCommand(INPUT);
    expect(m.threadFind).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it('never throws, and never logs the question, when the enqueue fails', async () => {
    m.start.mockRejectedValue(new Error('redis down: I am the CFO.'));
    await expect(
      enqueueMemoryExtractionCommand(INPUT),
    ).resolves.toBeUndefined();
    expect(JSON.stringify(m.warn.mock.calls)).not.toContain('CFO');
  });

  it('marks a plaintext question as such when encryption is off', async () => {
    m.encryptionOn.mockReturnValue(false);
    m.encrypt.mockResolvedValue('I am the CFO.');
    await enqueueMemoryExtractionCommand(INPUT);
    expect(m.start.mock.calls[0][2]).toMatchObject({
      question: 'I am the CFO.',
      questionEncrypted: false,
    });
  });
});
