import db from '@ragenai/prisma-client';

import { BRAIN_LIST_LIMIT } from '../../constants';
import { listSkip } from '../../utils/list-page';
import type {
  KnowledgePageList,
  KnowledgePageStatus,
} from '../../contracts/brain.types';

/**
 * The organization's knowledge pages, newest change first (spec D1).
 *
 * With no status, every page but the rejected ones: a rejection is a person
 * saying no, and a list that keeps showing it is a list nobody trusts. The
 * rejected are one filter away.
 */
export async function getKnowledgePagesQuery(
  orgId: string,
  status: KnowledgePageStatus | null,
  page = 1,
): Promise<KnowledgePageList> {
  const where = {
    organizationId: orgId,
    status: status ?? { not: 'REJECTED' as const },
  };
  const [rows, total] = await Promise.all([
    db.knowledgePage.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: listSkip(page),
      take: BRAIN_LIST_LIMIT,
      select: {
        id: true,
        publicId: true,
        title: true,
        type: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        owner: { select: { name: true, email: true } },
        sources: {
          where: { organizationId: orgId },
          select: { fileId: true },
        },
      },
    }),
    db.knowledgePage.count({ where }),
  ]);

  const ids = rows.map((r) => r.id);
  const findings = ids.length
    ? await db.knowledgeFinding.findMany({
        where: {
          organizationId: orgId,
          status: 'OPEN',
          pageIds: { hasSome: ids },
        },
        select: { pageIds: true },
      })
    : [];
  const open = new Map<number, number>();
  for (const f of findings) {
    for (const id of new Set(f.pageIds)) {
      open.set(id, (open.get(id) ?? 0) + 1);
    }
  }

  return {
    total,
    items: rows.map((r) => ({
      publicId: r.publicId,
      title: r.title,
      type: r.type,
      status: r.status,
      ownerName: r.owner ? (r.owner.name ?? r.owner.email) : null,
      documents: new Set(r.sources.map((s) => s.fileId)).size,
      openFindings: open.get(r.id) ?? 0,
      published: r.publishedAt !== null,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
