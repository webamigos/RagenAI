import db from '@ragenai/prisma-client';
import type { NegativeQaItem } from '@/features/documents/contracts/knowledge-analytics.types';

export async function getNegativeQaQuery(
  orgId: string,
  days: number,
): Promise<NegativeQaItem[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const messages = await db.message.findMany({
    where: {
      rate: 0,
      createdAt: { gte: since },
      thread: { organizationId: orgId },
    },
    select: {
      id: true,
      createdAt: true,
      thread: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return messages
    .filter((m) => m.thread !== null)
    .map((m) => ({
      messageId: m.id,
      threadId: m.thread!.id,
      threadTitle: m.thread!.title ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
}
