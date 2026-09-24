import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Publication (spec E2/E3) against a transaction double. What it pins:
 * publish records the generation it bumped and queues exactly that
 * generation; a retry re-queues without a second decision; unpublish bumps
 * first, deletes second, records last — and records nothing if the delete
 * fails.
 */
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  knowledgePage: { findFirst: vi.fn(), updateMany: vi.fn() },
  knowledgeDecision: { create: vi.fn() },
  userFile: { create: vi.fn(), updateMany: vi.fn() },
  member: { findFirst: vi.fn(), findMany: vi.fn() },
  team: { findMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const runtime = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/libs/jobs', () => ({ jobs: () => runtime }));
const vectors = vi.hoisted(() => ({ deleteFileFromVectorStore: vi.fn() }));
vi.mock('@/app/api/upload/services/TableService', () => vectors);
const reconcile = vi.hoisted(() => ({ startFindingsReconcile: vi.fn() }));
vi.mock('../services/commands/start-findings-reconcile', () => reconcile);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { publishKnowledgePageCommand } =
  await import('../services/commands/publish-knowledge-page-command');
const { unpublishKnowledgePageCommand } =
  await import('../services/commands/unpublish-knowledge-page-command');

const ORG = 'org-1';
const SEEN = new Date('2026-09-24T01:00:00.000Z');
const PUBLIC_ID = '11111111-2222-4333-8444-555555555555';
const input = {
  orgId: ORG,
  actorId: 'u-admin',
  publicId: PUBLIC_ID,
  expectedUpdatedAt: SEEN.toISOString(),
};
const HASH = `sha256:${'a'.repeat(64)}`;

function givenPage(over: Record<string, unknown> = {}) {
  tx.$queryRaw.mockResolvedValue([{ id: 7 }]);
  tx.knowledgePage.findFirst.mockResolvedValue({
    id: 7,
    slug: 'urlop',
    title: 'Urlop wypoczynkowy',
    status: 'APPROVED',
    content: '# Urlop\n',
    contentHash: HASH,
    ownerId: 'u-owner',
    accessibleBy: ['team:hr'],
    publishedAt: null,
    publicationGeneration: 2,
    publishedFileId: null,
    updatedAt: SEEN,
    publishedFile: null,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps queued `…Once` values; a test that stops early
  // would hand its leftovers to the next one.
  tx.knowledgePage.findFirst.mockReset();
  tx.member.findFirst.mockResolvedValue({ id: 'm' });
  tx.member.findMany.mockResolvedValue([]);
  tx.team.findMany.mockResolvedValue([{ id: 'hr' }]);
  tx.userFile.create.mockResolvedValue({ id: 'file-9' });
  runtime.start.mockResolvedValue(undefined);
  vectors.deleteFileFromVectorStore.mockResolvedValue(undefined);
});

describe('publishKnowledgePageCommand', () => {
  it('creates the vehicle file once, bumps the generation and queues exactly it', async () => {
    givenPage();
    await expect(publishKnowledgePageCommand(input)).resolves.toEqual({
      success: true,
      changed: true,
    });
    const file = tx.userFile.create.mock.calls[0][0].data;
    expect(file).toMatchObject({
      organizationId: ORG,
      fileName: 'Urlop wypoczynkowy',
      fileType: 'MARKDOWN',
      ownerId: 'u-owner',
      isOrgWide: false,
      metadata: {
        brain: {
          pageId: PUBLIC_ID,
          contentHash: HASH,
          publicationGeneration: 3,
        },
      },
    });
    expect(tx.knowledgePage.updateMany.mock.calls[0][0]).toMatchObject({
      where: { organizationId: ORG, id: 7 },
      data: { publishedFileId: 'file-9', publicationGeneration: 3 },
    });
    expect(tx.knowledgeDecision.create.mock.calls[0][0].data).toMatchObject({
      action: 'PUBLISH',
      publicationGeneration: 3,
    });
    expect(runtime.start).toHaveBeenCalledWith(
      'brainPublishPage',
      expect.stringMatching(new RegExp(`^brain-publish-${PUBLIC_ID}-3-`)),
      { orgId: ORG, pageId: PUBLIC_ID, generation: 3 },
    );
  });

  it('reuses the file on a republish and never creates a second one', async () => {
    givenPage({
      publishedAt: SEEN,
      publishedFileId: 'file-9',
      publishedFile: {
        embeddingStatus: 'COMPLETED',
        metadata: { brain: { contentHash: 'sha256:old' } },
      },
    });
    await publishKnowledgePageCommand(input);
    expect(tx.userFile.create).not.toHaveBeenCalled();
    expect(tx.userFile.updateMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      id: 'file-9',
    });
    // The file's sharing follows the page on a republish too, so a page
    // narrowed while withdrawn does not come back on an org-wide file.
    expect(tx.userFile.updateMany.mock.calls[0][0].data).toMatchObject({
      ownerId: 'u-owner',
      isOrgWide: false,
    });
  });

  it('re-queues an unfinished publication at its generation, with no new decision', async () => {
    givenPage({
      publishedAt: SEEN,
      publishedFileId: 'file-9',
      publicationGeneration: 3,
      publishedFile: {
        embeddingStatus: 'STARTED',
        metadata: { brain: { contentHash: HASH } },
      },
    });
    await expect(publishKnowledgePageCommand(input)).resolves.toEqual({
      success: true,
      changed: true,
    });
    expect(tx.knowledgeDecision.create).not.toHaveBeenCalled();
    expect(runtime.start.mock.calls[0][2]).toEqual({
      orgId: ORG,
      pageId: PUBLIC_ID,
      generation: 3,
    });
  });

  it('writes nothing for a page already serving this content', async () => {
    givenPage({
      publishedAt: SEEN,
      publishedFileId: 'file-9',
      publishedFile: {
        embeddingStatus: 'COMPLETED',
        metadata: { brain: { contentHash: HASH } },
      },
    });
    await expect(publishKnowledgePageCommand(input)).resolves.toEqual({
      success: true,
      changed: false,
    });
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it.each([
    ['a candidate', { status: 'CANDIDATE' }, 'invalid-status'],
    ['an unowned page', { ownerId: null }, 'owner-required'],
    ['a page open to nobody', { accessibleBy: [] }, 'no-access'],
    [
      'a page naming a team that is gone',
      { accessibleBy: ['team:gone'] },
      'invalid-access',
    ],
    [
      'a page changed since it was read',
      { updatedAt: new Date(0) },
      'conflict',
    ],
  ])('refuses %s, writing nothing', async (_, over, error) => {
    givenPage(over);
    tx.team.findMany.mockResolvedValue([]);
    if (!('accessibleBy' in over)) {
      tx.team.findMany.mockResolvedValue([{ id: 'hr' }]);
    }
    await expect(publishKnowledgePageCommand(input)).resolves.toEqual({
      success: false,
      error,
    });
    expect(tx.knowledgeDecision.create).not.toHaveBeenCalled();
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('says the write could not start when the queue refuses it', async () => {
    givenPage();
    runtime.start.mockRejectedValue(new Error('redis down'));
    await expect(publishKnowledgePageCommand(input)).resolves.toEqual({
      success: false,
      error: 'failed-to-start',
    });
  });
});

describe('unpublishKnowledgePageCommand', () => {
  function givenPublished(generationAtEnd = 4) {
    tx.$queryRaw.mockResolvedValue([{ id: 7 }]);
    tx.knowledgePage.findFirst
      .mockResolvedValueOnce({
        id: 7,
        publishedAt: SEEN,
        publishedFileId: 'file-9',
        publicationGeneration: 3,
        updatedAt: SEEN,
      })
      .mockResolvedValueOnce({ publicationGeneration: generationAtEnd });
  }

  it('bumps the generation, deletes the chunks, then records — in that order', async () => {
    givenPublished();
    await expect(unpublishKnowledgePageCommand(input)).resolves.toEqual({
      success: true,
      changed: true,
    });
    const bump = tx.knowledgePage.updateMany.mock.calls[0][0];
    expect(bump.data).toEqual({ publicationGeneration: 4 });
    expect(vectors.deleteFileFromVectorStore).toHaveBeenCalledWith(
      'file-9',
      ORG,
    );
    expect(tx.knowledgePage.updateMany.mock.calls[1][0].data).toEqual({
      publishedAt: null,
    });
    expect(tx.userFile.updateMany.mock.calls[0][0].data).toEqual({
      embeddingStatus: 'WITHDRAWN',
    });
    expect(tx.knowledgeDecision.create.mock.calls[0][0].data).toMatchObject({
      action: 'UNPUBLISH',
      publicationGeneration: 4,
    });
    expect(
      tx.knowledgePage.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      vectors.deleteFileFromVectorStore.mock.invocationCallOrder[0]!,
    );
    expect(
      vectors.deleteFileFromVectorStore.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.knowledgePage.updateMany.mock.invocationCallOrder[1]!);
  });

  it('records nothing and keeps the page published when the delete fails', async () => {
    givenPublished();
    vectors.deleteFileFromVectorStore.mockRejectedValue(
      new Error('qdrant down'),
    );
    await expect(unpublishKnowledgePageCommand(input)).resolves.toEqual({
      success: false,
      error: 'index-unavailable',
    });
    expect(tx.knowledgeDecision.create).not.toHaveBeenCalled();
    expect(tx.knowledgePage.updateMany).toHaveBeenCalledTimes(1);
  });

  it('treats a missing collection as nothing to delete', async () => {
    givenPublished();
    vectors.deleteFileFromVectorStore.mockRejectedValue(
      Object.assign(new Error('Not Found'), { status: 404 }),
    );
    await expect(unpublishKnowledgePageCommand(input)).resolves.toMatchObject({
      success: true,
    });
  });

  it('records nothing if someone published again after the bump', async () => {
    givenPublished(5);
    await expect(unpublishKnowledgePageCommand(input)).resolves.toEqual({
      success: false,
      error: 'conflict',
    });
    expect(tx.knowledgeDecision.create).not.toHaveBeenCalled();
  });

  it('refuses a page that is not published', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 7 }]);
    tx.knowledgePage.findFirst.mockResolvedValueOnce({
      id: 7,
      publishedAt: null,
      publishedFileId: 'file-9',
      publicationGeneration: 3,
      updatedAt: SEEN,
    });
    await expect(unpublishKnowledgePageCommand(input)).resolves.toEqual({
      success: false,
      error: 'invalid-status',
    });
    expect(vectors.deleteFileFromVectorStore).not.toHaveBeenCalled();
  });
});

describe('vehicleFileName', () => {
  it('names the file after the page, safe for a file name', async () => {
    const { vehicleFileName } =
      await import('../services/commands/publish-knowledge-page-command');
    expect(vehicleFileName('Urlop / zasady\n2026')).toBe('Urlop zasady 2026');
    expect(vehicleFileName('   ')).toBe('Brain');
  });
});
