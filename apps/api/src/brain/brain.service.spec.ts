import { NotFoundException } from '@nestjs/common';

import { BrainService } from './brain.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type KeyId,
  type ProjectId,
} from '../common/types/brand.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type SubscriptionsService } from '../subscriptions/subscriptions.service.js';

const CONTEXT: ApiContext = {
  orgId: 'org-1' as OrgId,
  userId: 'u-1' as UserId,
  keyId: 'k-1' as KeyId,
  debugMode: false,
};

function makeService(
  overrides: Record<string, unknown> = {},
  enabled = true,
  role = 'owner',
) {
  const db = {
    member: { findFirst: vi.fn().mockResolvedValue(role ? { role } : null) },
    userFile: { count: vi.fn().mockResolvedValue(3) },
    knowledgePage: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    knowledgeFinding: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    knowledgeEdge: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
  const prisma = { client: db } as unknown as PrismaService;
  const isFeatureEnabled = vi.fn().mockResolvedValue(enabled);
  const subscriptions = { isFeatureEnabled } as unknown as SubscriptionsService;
  return {
    service: new BrainService(prisma, subscriptions),
    db,
    isFeatureEnabled,
  };
}

/** The `where` of a mock's first call, typed for the assertions below. */
function whereOf(fn: {
  mock: { calls: unknown[][] };
}): Record<string, unknown> {
  return (fn.mock.calls[0][0] as { where: Record<string, unknown> }).where;
}

describe('BrainService', () => {
  describe('access', () => {
    it('answers 404 when the organization has Brain off', async () => {
      const { service } = makeService({}, false);
      await expect(service.next(CONTEXT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 404 to a member who does not manage the organization', async () => {
      const { service } = makeService({}, true, 'member');
      await expect(service.pages(CONTEXT, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 404 to a key whose user is not a member at all', async () => {
      const { service } = makeService({}, true, '');
      await expect(service.health(CONTEXT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([
      ['an assistant-scoped key', { knowledgeScope: 'ASSISTANT' as const }],
      ['a model-only key', { knowledgeScope: 'MODEL_ONLY' as const }],
      [
        'an unscoped context confined to a project',
        { projectId: 'p-1' as ProjectId },
      ],
    ])('answers 404 to %s, before reading anything', async (_, scope) => {
      const { service, db, isFeatureEnabled } = makeService();
      await expect(
        service.exportBundle({ ...CONTEXT, ...scope }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.member.findFirst).not.toHaveBeenCalled();
      expect(isFeatureEnabled).not.toHaveBeenCalled();
    });

    it('serves a knowledge-base key', async () => {
      const { service } = makeService();
      await expect(
        service.next({ ...CONTEXT, knowledgeScope: 'KNOWLEDGE_BASE' }),
      ).resolves.toBeDefined();
    });

    it('asks about the key’s own organization and user', async () => {
      const { service, db, isFeatureEnabled } = makeService();
      await service.next(CONTEXT);
      expect(whereOf(db.member.findFirst)).toEqual({
        organizationId: 'org-1',
        userId: 'u-1',
      });
      expect(isFeatureEnabled).toHaveBeenCalledWith('org-1', 'brain');
    });
  });

  describe('next', () => {
    it('says to add documents first when there are none', async () => {
      const { service } = makeService({
        userFile: { count: vi.fn().mockResolvedValue(0) },
      });
      await expect(service.next(CONTEXT)).resolves.toMatchObject({
        state: 'no-documents',
      });
    });

    it('puts a failed extraction before the review queue', async () => {
      const { service } = makeService({
        knowledgePage: {
          count: vi.fn().mockResolvedValue(5),
          findMany: vi.fn(),
        },
        knowledgeFinding: {
          count: vi.fn().mockResolvedValueOnce(2).mockResolvedValue(9),
          findMany: vi.fn(),
        },
      });
      await expect(service.next(CONTEXT)).resolves.toMatchObject({
        state: 'retry',
        command: 'ragen brain findings',
      });
    });

    it('says everything is curated when nothing is waiting', async () => {
      const count = vi
        .fn()
        // pages, candidates, unpublished
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      const { service } = makeService({
        knowledgePage: { count, findMany: vi.fn() },
      });
      await expect(service.next(CONTEXT)).resolves.toMatchObject({
        state: 'done',
      });
    });
  });

  describe('pages', () => {
    it('searches title and content inside the organization, rejected pages left out', async () => {
      const { service, db } = makeService();
      await service.pages(CONTEXT, { q: 'urlop' });
      const where = whereOf(db.knowledgePage.findMany);
      expect(where.organizationId).toBe('org-1');
      expect(where.status).toEqual({ not: 'REJECTED' });
      expect(where.OR).toEqual([
        { title: { contains: 'urlop', mode: 'insensitive' } },
        { content: { contains: 'urlop', mode: 'insensitive' } },
      ]);
    });
  });

  describe('health', () => {
    it('reports each check, ok where nothing is wrong', async () => {
      const { service } = makeService({
        knowledgePage: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn(),
        },
        knowledgeFinding: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn(),
        },
      });
      const checks = await service.health(CONTEXT);
      expect(checks.map((c) => c.name)).toEqual([
        'brain',
        'publication',
        'publication-file',
        'extraction',
        'owners',
        'access',
        'staleness',
      ]);
      expect(checks.every((c) => c.status === 'ok')).toBe(true);
    });
  });

  describe('exportBundle', () => {
    it('returns the bundle as files with the pages it left out', async () => {
      const { service } = makeService({
        knowledgePage: {
          count: vi.fn(),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              publicId: '00000000-0000-4000-8000-000000000001',
              slug: 'urlop',
              title: 'Urlop',
              type: 'POLICY',
              status: 'CANDIDATE',
              content: '# Urlop\n',
              contentHash: `sha256:${'a'.repeat(64)}`,
              accessibleBy: ['org:org-1'],
              validFrom: null,
              verifyEvery: null,
              lastVerifiedAt: null,
              lastVerifiedBy: null,
              owner: null,
              supersededBy: null,
              sources: [],
            },
          ]),
        },
      });
      const result = await service.exportBundle(CONTEXT);
      expect(Object.keys(result.files).sort()).toEqual([
        'graph.json',
        'manifest.json',
      ]);
      expect(result.skipped).toEqual([
        {
          id: '00000000-0000-4000-8000-000000000001',
          title: 'Urlop',
          reason: 'not-approved',
        },
      ]);
    });
  });
});
