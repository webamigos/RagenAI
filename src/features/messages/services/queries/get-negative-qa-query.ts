import db from '@ragenai/prisma-client';
import type {
  NegativeQaItem,
  NegativeQaResult,
} from '@/features/documents/contracts/knowledge-analytics.types';

const PAGE_SIZE = 10;

export async function getNegativeQaQuery(
  orgId: string,
  days: number,
  page: number = 1,
): Promise<NegativeQaResult> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    rate: 0,
    createdAt: { gte: since },
    thread: { organizationId: orgId },
  };

  const [messages, total] = await Promise.all([
    db.message.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        thread: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
    db.message.count({ where }),
  ]);

  const items: NegativeQaItem[] = messages
    .filter((m) => m.thread !== null)
    .map((m) => ({
      messageId: m.id,
      threadId: m.thread!.id,
      threadTitle: m.thread!.title ?? null,
      createdAt: m.createdAt.toISOString(),
    }));

  return { items, total };
}
