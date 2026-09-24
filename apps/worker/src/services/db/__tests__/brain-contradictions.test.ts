import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  userFile: { findMany: vi.fn() },
  knowledgeFinding: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
vi.mock('../prisma.js', () => ({ getPrisma: () => prisma }));

import {
  loadContradictionCandidates,
  recordContradictionJudgement,
} from '../brain-contradictions.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadContradictionCandidates', () => {
  it('reads pages that are not rejected, with their live sources, scoped', async () => {
    prisma.knowledgePage.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Urlop',
        publishedAt: new Date(),
        sources: [{ id: 10, fileId: 'f-run', quote: 'q1' }],
      },
      {
        id: 2,
        title: 'Urlop',
        publishedAt: null,
        sources: [{ id: 20, fileId: 'f-old', quote: 'q2' }],
      },
    ]);
    prisma.userFile.findMany.mockResolvedValue([
      { id: 'f-run', language: 'pol' },
      { id: 'f-old', language: null },
    ]);
    const { pages, touched } = await loadContradictionCandidates('org-1', [
      'f-run',
    ]);
    const args = prisma.knowledgePage.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      organizationId: 'org-1',
      status: { not: 'REJECTED' },
    });
    expect(args.select.sources.where).toEqual({
      organizationId: 'org-1',
      sourceDeletedAt: null,
    });
    expect([...touched]).toEqual([1]);
    expect(pages[0]).toEqual({
      id: 1,
      title: 'Urlop',
      fileIds: ['f-run'],
      published: true,
      judged: {
        title: 'Urlop',
        language: 'pol',
        claims: [{ sourceId: 10, quote: 'q1' }],
      },
    });
    expect(pages[1].judged.language).toBeNull();
    expect(prisma.userFile.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      id: { in: ['f-run', 'f-old'] },
    });
  });

  it('gives a page the language most of its sources are in', async () => {
    prisma.knowledgePage.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Urlop',
        publishedAt: null,
        sources: [
          { id: 10, fileId: 'en', quote: 'q' },
          { id: 11, fileId: 'pl-1', quote: 'q' },
          { id: 12, fileId: 'pl-2', quote: 'q' },
        ],
      },
    ]);
    prisma.userFile.findMany.mockResolvedValue([
      { id: 'en', language: 'eng' },
      { id: 'pl-1', language: 'pol' },
      { id: 'pl-2', language: 'pol' },
    ]);
    const { pages } = await loadContradictionCandidates('org-1', []);
    expect(pages[0].judged.language).toBe('pol');
  });
});

describe('recordContradictionJudgement', () => {
  const found = [
    { aSourceId: 11, bSourceId: 20, explanation: 'x' },
    { aSourceId: 10, bSourceId: 20, explanation: 'y' },
  ];
  const input = (over = {}) => ({
    orgId: 'org-1',
    pageIds: [9, 4] as [number, number],
    contradictions: found,
    truncated: false,
    published: false,
    runId: 'run-1',
    ...over,
  });
  const FINGERPRINT = '10:20|11:20';

  it('raises one finding for the pair, pages sorted, with the passages', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([]);
    await expect(recordContradictionJudgement(input())).resolves.toBe('raised');
    expect(prisma.knowledgeFinding.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      type: 'CONTRADICTION',
      pageIds: { equals: [4, 9] },
      status: { in: ['OPEN', 'DISMISSED'] },
    });
    expect(prisma.knowledgeFinding.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        type: 'CONTRADICTION',
        severity: 'MEDIUM',
        pageIds: [4, 9],
        detail: {
          fingerprint: FINGERPRINT,
          pairs: found,
          truncated: false,
          runId: 'run-1',
        },
      },
    });
  });

  it('is HIGH when either page is serving in the index', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([]);
    await recordContradictionJudgement(input({ published: true }));
    expect(prisma.knowledgeFinding.create.mock.calls[0][0].data.severity).toBe(
      'HIGH',
    );
  });

  // Rewording the explanation between runs must not reopen a decision.
  it('respects a dismissal of the same passages', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      { id: 3, status: 'DISMISSED', detail: { fingerprint: FINGERPRINT } },
    ]);
    await expect(recordContradictionJudgement(input())).resolves.toBe(
      'dismissed',
    );
    expect(prisma.knowledgeFinding.create).not.toHaveBeenCalled();
  });

  it('raises again when the passages differ from the dismissed ones', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      { id: 3, status: 'DISMISSED', detail: { fingerprint: '10:20' } },
    ]);
    await expect(recordContradictionJudgement(input())).resolves.toBe('raised');
  });

  it('leaves an open finding with the same passages alone', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      {
        id: 3,
        status: 'OPEN',
        severity: 'MEDIUM',
        detail: { fingerprint: FINGERPRINT },
      },
    ]);
    await expect(recordContradictionJudgement(input())).resolves.toBe(
      'unchanged',
    );
    expect(prisma.knowledgeFinding.updateMany).not.toHaveBeenCalled();
  });

  it('re-grades an open finding with the same passages once a page is serving', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      {
        id: 3,
        status: 'OPEN',
        severity: 'MEDIUM',
        detail: { fingerprint: FINGERPRINT },
      },
    ]);
    await expect(
      recordContradictionJudgement(input({ published: true })),
    ).resolves.toBe('updated');
    expect(prisma.knowledgeFinding.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 3, status: 'OPEN' },
      data: { severity: 'HIGH' },
    });
  });

  it('updates an open finding in place when the passages changed', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      { id: 3, status: 'OPEN', detail: { fingerprint: '10:20' } },
    ]);
    await expect(recordContradictionJudgement(input())).resolves.toBe(
      'updated',
    );
    expect(prisma.knowledgeFinding.updateMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      id: 3,
      status: 'OPEN',
    });
  });

  it('clears an open finding when the pair no longer contradicts', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      { id: 3, status: 'OPEN', detail: { fingerprint: FINGERPRINT } },
    ]);
    await expect(
      recordContradictionJudgement(input({ contradictions: [] })),
    ).resolves.toBe('cleared');
    expect(prisma.knowledgeFinding.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 3, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
    });
  });

  it('never clears an open finding from a judgement that saw only part of the pages', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([
      { id: 3, status: 'OPEN', detail: { fingerprint: FINGERPRINT } },
    ]);
    await expect(
      recordContradictionJudgement(
        input({ contradictions: [], truncated: true }),
      ),
    ).resolves.toBe('unchanged');
    expect(prisma.knowledgeFinding.updateMany).not.toHaveBeenCalled();
  });

  it('writes nothing for a clean pair with nothing open', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([]);
    await expect(
      recordContradictionJudgement(input({ contradictions: [] })),
    ).resolves.toBe('none');
    expect(prisma.knowledgeFinding.create).not.toHaveBeenCalled();
    expect(prisma.knowledgeFinding.updateMany).not.toHaveBeenCalled();
  });
});
