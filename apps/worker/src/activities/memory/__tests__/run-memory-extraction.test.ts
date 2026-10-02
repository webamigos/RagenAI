import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const tx = {
    member: { findFirst: vi.fn() },
    userMemoryProfile: { upsert: vi.fn(), updateMany: vi.fn() },
    userMemory: { updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    userMemoryChange: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return {
    tx,
    prisma: {
      userMemoryProfile: { findUnique: vi.fn() },
      member: { findFirst: vi.fn() },
      thread: { findFirst: vi.fn() },
      userMemory: { findMany: vi.fn() },
      organizationSettings: { findUnique: vi.fn() },
      aiUsage: { aggregate: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    features: vi.fn(),
    generate: vi.fn(),
    trackAiUsage: vi.fn(),
    resolveKey: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
  };
});

vi.mock('../../../services/db/prisma.js', () => ({
  getPrisma: () => m.prisma,
}));
vi.mock('../../../services/org-features.js', () => ({
  resolveOrgFeatures: () => m.features(),
}));
vi.mock('../../../services/llm/provider.js', () => ({
  getChatModelForOrg: vi.fn(async () => 'model'),
}));
vi.mock('../../brain/structured-generator.js', () => ({
  structuredGenerator: () => m.generate,
}));
vi.mock('../../../services/db/db.js', () => ({
  db: { trackAiUsage: (...a: unknown[]) => m.trackAiUsage(...a) },
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: m.logInfo, warn: m.logWarn, error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@ragenai/crypto', () => ({
  decryptDocumentContent: vi.fn(async (c: string) => `decrypted:${c}`),
  openOwnedRows: vi.fn(async (rows: unknown[]) => rows),
  resolveOwnerKeyForTransaction: (...a: unknown[]) => m.resolveKey(...a),
  sealOwnedContent: (content: string) => ({ content, isEncrypted: false }),
}));

import { runMemoryExtraction } from '../run-memory-extraction.js';

const PAYLOAD = {
  orgId: 'org-1',
  userId: 'user-1',
  threadId: 'thread-1',
  messageId: 'msg-1',
  epoch: 0,
  question: 'I am the CFO; keep answers short.',
  questionEncrypted: false,
};

const on = { personalMemory: { value: true } };
const off = { personalMemory: { value: false } };

beforeEach(() => {
  vi.clearAllMocks();
  m.features.mockResolvedValue(on);
  m.prisma.userMemoryProfile.findUnique.mockResolvedValue(null);
  m.prisma.member.findFirst.mockResolvedValue({ id: 'mem-1' });
  m.prisma.thread.findFirst.mockResolvedValue({ encryptedDek: null });
  m.prisma.userMemory.findMany.mockResolvedValue([]);
  m.prisma.organizationSettings.findUnique.mockResolvedValue(null);
  m.prisma.aiUsage.aggregate.mockResolvedValue({
    _sum: { totalTokens: 0, estimatedCost: 0 },
  });
  m.prisma.aiUsage.count.mockResolvedValue(0);
  m.generate.mockResolvedValue({
    object: {
      operations: [
        { op: 'ADD', content: 'Is the CFO.' },
        { op: 'ADD', content: 'Prefers short answers.' },
      ],
    },
    usage: { inputTokens: 120, outputTokens: 30 },
  });
  m.resolveKey.mockResolvedValue({ status: 'plaintext' });
  m.tx.member.findFirst.mockResolvedValue({ id: 'mem-1' });
  m.tx.userMemoryProfile.upsert.mockResolvedValue({ id: 9 });
  m.tx.userMemoryProfile.updateMany.mockResolvedValue({ count: 1 });
  m.tx.$queryRaw.mockResolvedValue([{ extraction_enabled: true, epoch: 0 }]);
  m.tx.userMemory.create.mockImplementation(async () => ({
    publicId: `pub-${m.tx.userMemory.create.mock.calls.length}`,
  }));
  m.tx.userMemory.updateMany.mockResolvedValue({ count: 1 });
  m.tx.userMemory.deleteMany.mockResolvedValue({ count: 1 });
});

describe('runMemoryExtraction', () => {
  it('extracts, writes each memory with its change row, and records MEMORY usage', async () => {
    const result = await runMemoryExtraction(PAYLOAD);

    expect(result).toEqual({
      skipped: null,
      added: 2,
      updated: 0,
      deleted: 0,
      dropped: 0,
    });
    expect(m.tx.userMemory.create).toHaveBeenCalledTimes(2);
    expect(m.tx.userMemoryChange.create.mock.calls[0][0].data).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      messageId: 'msg-1',
      sourceThreadId: 'thread-1',
      operation: 'ADD',
      resultVersion: 1,
    });
    expect(m.trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'MEMORY', totalTokens: 150 }),
    );
  });

  it('decrypts the question with the thread’s key when it travelled encrypted', async () => {
    m.prisma.thread.findFirst.mockResolvedValue({ encryptedDek: 'dek' });
    await runMemoryExtraction({
      ...PAYLOAD,
      question: 'cipher',
      questionEncrypted: true,
    });
    expect(m.generate.mock.calls[0][0].prompt).toContain('decrypted:cipher');
  });

  it.each([
    ['the key is off', () => m.features.mockResolvedValue(off), 'disabled'],
    [
      'the user opted out',
      () =>
        m.prisma.userMemoryProfile.findUnique.mockResolvedValue({
          extractionEnabled: false,
          epoch: 0,
        }),
      'opted-out',
    ],
    [
      'the user forgot everything since the turn',
      () =>
        m.prisma.userMemoryProfile.findUnique.mockResolvedValue({
          extractionEnabled: true,
          epoch: 1,
        }),
      'stale',
    ],
    [
      'the user is no longer a member',
      () => m.prisma.member.findFirst.mockResolvedValue(null),
      'not-member',
    ],
  ] as const)('calls no model when %s', async (_case, arrange, reason) => {
    arrange();
    expect((await runMemoryExtraction(PAYLOAD)).skipped).toBe(reason);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks the org’s ceiling at this call site, before the model call', async () => {
    m.prisma.organizationSettings.findUnique.mockResolvedValue({
      monthlyTokenLimit: 1000,
      monthlyCostLimitCents: null,
      monthlyMessageLimit: null,
    });
    m.prisma.aiUsage.aggregate.mockResolvedValue({
      _sum: { totalTokens: 1000, estimatedCost: 0 },
    });
    expect((await runMemoryExtraction(PAYLOAD)).skipped).toBe('ceiling');
    expect(m.generate).not.toHaveBeenCalled();
  });

  it('is not stopped by the message ceiling, which counts chat turns', async () => {
    m.prisma.organizationSettings.findUnique.mockResolvedValue({
      monthlyTokenLimit: null,
      monthlyCostLimitCents: null,
      monthlyMessageLimit: 1,
    });
    m.prisma.aiUsage.count.mockResolvedValue(5);
    expect((await runMemoryExtraction(PAYLOAD)).skipped).toBeNull();
  });

  // The enqueue-time gate is minutes old; these change between it and the
  // write, and the job must write nothing in each case.
  describe('re-checked under the profile lock', () => {
    it.each([
      [
        'a "forget everything"',
        () =>
          m.tx.$queryRaw.mockResolvedValue([
            { extraction_enabled: true, epoch: 1 },
          ]),
        'stale',
      ],
      [
        'an opt-out',
        () =>
          m.tx.$queryRaw.mockResolvedValue([
            { extraction_enabled: false, epoch: 0 },
          ]),
        'opted-out',
      ],
      [
        'a member removal',
        () => m.tx.member.findFirst.mockResolvedValue(null),
        'not-member',
      ],
      [
        'the key turned off',
        () => m.features.mockResolvedValueOnce(on).mockResolvedValueOnce(off),
        'disabled',
      ],
    ] as const)(
      'writes nothing after %s mid-job',
      async (_case, arrange, reason) => {
        arrange();
        const result = await runMemoryExtraction(PAYLOAD);
        expect(result.skipped).toBe(reason);
        expect(m.tx.userMemory.create).not.toHaveBeenCalled();
        expect(m.tx.userMemoryChange.create).not.toHaveBeenCalled();
      },
    );
  });

  it('lets a user’s edit made mid-job win over the model’s UPDATE', async () => {
    m.prisma.userMemory.findMany.mockResolvedValue([
      {
        publicId: 'pub-a',
        content: 'Is the CFO.',
        isEncrypted: false,
        version: 2,
        updatedAt: new Date('2026-10-01'),
      },
    ]);
    m.generate.mockResolvedValue({
      object: {
        operations: [{ op: 'UPDATE', ref: 'm1', content: 'Is the COO.' }],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    m.tx.userMemory.updateMany.mockResolvedValue({ count: 0 });

    const result = await runMemoryExtraction(PAYLOAD);

    expect(m.tx.userMemory.updateMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      publicId: 'pub-a',
      updatedAt: new Date('2026-10-01'),
    });
    expect(result.updated).toBe(0);
    expect(m.tx.userMemoryChange.create).not.toHaveBeenCalled();
  });

  it('stores a new key inside the transaction, and retries under the winner’s after a lost race', async () => {
    m.resolveKey
      .mockResolvedValueOnce({
        status: 'key',
        dek: Buffer.alloc(32),
        newEncryptedDek: 'mine',
      })
      .mockResolvedValueOnce({
        status: 'key',
        dek: Buffer.alloc(32),
        newEncryptedDek: null,
      });
    m.tx.userMemoryProfile.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await runMemoryExtraction(PAYLOAD);

    expect(m.tx.userMemoryProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 9, encryptedDek: null },
      data: { encryptedDek: 'mine' },
    });
    expect(m.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(result.added).toBe(2);
  });

  it('writes nothing when encryption is on and the owner key is unavailable', async () => {
    m.resolveKey.mockResolvedValue({
      status: 'unavailable',
      error: new Error('kms'),
    });
    expect((await runMemoryExtraction(PAYLOAD)).skipped).toBe(
      'key-unavailable',
    );
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats an unparseable answer as a no-op, and still records its usage', async () => {
    m.generate.mockResolvedValue({
      object: null,
      usage: { inputTokens: 50, outputTokens: 0 },
    });
    expect((await runMemoryExtraction(PAYLOAD)).skipped).toBe('unparseable');
    expect(m.trackAiUsage).toHaveBeenCalled();
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('says so, without content, when every operation is dropped', async () => {
    m.generate.mockResolvedValue({
      object: {
        operations: [
          { op: 'ADD', content: 'Works with <PERSON_1> on the CFO report.' },
          { kind: 'ADD', content: 'Is the CFO.' },
        ],
      },
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const result = await runMemoryExtraction(PAYLOAD);

    expect(result).toMatchObject({ skipped: null, added: 0, dropped: 2 });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({ dropped: 2 }),
      'memoryExtract: every operation dropped',
    );
    expect(JSON.stringify(m.logInfo.mock.calls)).not.toContain('CFO');
  });

  it('never logs the question or a memory', async () => {
    m.features.mockResolvedValue(off);
    await runMemoryExtraction(PAYLOAD);
    m.features.mockResolvedValue(on);
    m.resolveKey.mockResolvedValue({
      status: 'unavailable',
      error: new Error('kms'),
    });
    await runMemoryExtraction(PAYLOAD);

    const logged = JSON.stringify([
      ...m.logInfo.mock.calls,
      ...m.logWarn.mock.calls,
    ]);
    expect(logged).not.toContain('CFO');
    expect(logged).not.toContain('short answers');
  });
});
