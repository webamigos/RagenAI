import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
const fileFindMany = vi.fn();
const fileCount = vi.fn();
const pairFindFirst = vi.fn();
const pairCreate = vi.fn();
const pairDeleteMany = vi.fn();

const tx = {
  $queryRaw: (...a: unknown[]) => queryRaw(...a),
  userFile: { findMany: (...a: unknown[]) => fileFindMany(...a) },
  documentPair: {
    findFirst: (...a: unknown[]) => pairFindFirst(...a),
    create: (...a: unknown[]) => pairCreate(...a),
  },
};

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    userFile: { count: (...a: unknown[]) => fileCount(...a) },
    documentPair: {
      findFirst: (...a: unknown[]) => pairFindFirst(...a),
      deleteMany: (...a: unknown[]) => pairDeleteMany(...a),
    },
  },
}));

const isFeatureEnabled = vi.fn();
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...a: unknown[]) => isFeatureEnabled(...a),
  }),
);
vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageDocuments: vi.fn(),
}));
const trackAudit = vi.fn();
vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({ trackAudit: (...a: unknown[]) => trackAudit(...a) }),
);

import { createDocumentPairCommand } from '../create-document-pair-command';
import { removeDocumentPairCommand } from '../remove-document-pair-command';

const actor = { userId: 'u1', teamIds: [], scope: 'member' } as never;
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabled.mockResolvedValue(true);
  queryRaw.mockResolvedValue([{ id: A }, { id: B }]);
  fileFindMany.mockResolvedValue([{ id: A }, { id: B }]);
  pairFindFirst.mockResolvedValue(null);
  pairCreate.mockResolvedValue({ id: 'pair-1' });
});

describe('createDocumentPairCommand', () => {
  const input = {
    organizationId: 'org',
    actor,
    fileId: B,
    counterpartFileId: A,
  };

  it('stores the smaller id first and writes who confirmed it', async () => {
    await expect(createDocumentPairCommand(input)).resolves.toEqual({
      ok: true,
      pairId: 'pair-1',
    });
    expect(pairCreate.mock.calls[0][0].data).toEqual({
      organizationId: 'org',
      fileAId: A,
      fileBId: B,
      createdById: 'u1',
      members: {
        create: [{ fileId: A }, { fileId: B }],
      },
    });
    expect(trackAudit).toHaveBeenCalled();
  });

  it('is refused when the feature is off', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await expect(createDocumentPairCommand(input)).rejects.toThrow();
    expect(pairCreate).not.toHaveBeenCalled();
  });

  it('refuses a file paired with itself', async () => {
    await expect(
      createDocumentPairCommand({ ...input, counterpartFileId: B }),
    ).resolves.toEqual({ ok: false, error: 'same-file' });
  });

  it('scopes both files by organization, access and not-a-vehicle', async () => {
    await createDocumentPairCommand(input);
    const where = fileFindMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org');
    expect(where.publishedPages).toEqual({ none: {} });
  });

  it('says not-found when the actor cannot read the other file', async () => {
    fileFindMany.mockResolvedValue([{ id: A }]);
    await expect(createDocumentPairCommand(input)).resolves.toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(pairCreate).not.toHaveBeenCalled();
  });

  it('says not-found when a file is in another organization', async () => {
    queryRaw.mockResolvedValue([{ id: A }]);
    await expect(createDocumentPairCommand(input)).resolves.toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('refuses when either file already has a pair, on either side', async () => {
    pairFindFirst.mockResolvedValue({ id: 'old' });
    await expect(createDocumentPairCommand(input)).resolves.toEqual({
      ok: false,
      error: 'already-paired',
    });
    const where = pairFindFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org');
    expect(where.OR).toHaveLength(2);
    expect(pairCreate).not.toHaveBeenCalled();
  });

  it('answers already-paired when the member key refuses a racing writer', async () => {
    pairCreate.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(createDocumentPairCommand(input)).resolves.toEqual({
      ok: false,
      error: 'already-paired',
    });
    expect(trackAudit).not.toHaveBeenCalled();
  });

  it('does not swallow other database errors', async () => {
    pairCreate.mockRejectedValue(new Error('connection lost'));
    await expect(createDocumentPairCommand(input)).rejects.toThrow(
      'connection lost',
    );
  });

  it('refuses a session with no user', async () => {
    await expect(
      createDocumentPairCommand({
        ...input,
        actor: { userId: null, teamIds: [], scope: 'none' } as never,
      }),
    ).resolves.toEqual({ ok: false, error: 'not-found' });
  });
});

describe('removeDocumentPairCommand', () => {
  const input = { organizationId: 'org', actor, fileId: A };
  beforeEach(() => {
    pairFindFirst.mockResolvedValue({ id: 'pair-1', fileAId: A, fileBId: B });
    fileCount.mockResolvedValue(2);
  });

  it('removes only the pair, scoped by organization', async () => {
    await expect(removeDocumentPairCommand(input)).resolves.toEqual({
      ok: true,
    });
    expect(pairDeleteMany).toHaveBeenCalledWith({
      where: { id: 'pair-1', organizationId: 'org' },
    });
  });

  it('is not-found when the actor cannot read the far end', async () => {
    fileCount.mockResolvedValue(1);
    await expect(removeDocumentPairCommand(input)).resolves.toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(pairDeleteMany).not.toHaveBeenCalled();
  });

  it('is not-found when the file has no pair', async () => {
    pairFindFirst.mockResolvedValue(null);
    await expect(removeDocumentPairCommand(input)).resolves.toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('is refused when the feature is off', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await expect(removeDocumentPairCommand(input)).rejects.toThrow();
  });
});
