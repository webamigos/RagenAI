import db from '@ragenai/prisma-client';
import { Role } from '@/generated/prisma/client';
import type { DailyQuestion } from '@/features/documents/contracts/knowledge-analytics.types';

export async function getDailyQuestionsQuery(
  orgId: string,
  days: number,
): Promise<DailyQuestion[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const messages = await db.message.findMany({
    where: {
      thread: { organizationId: orgId },
      createdAt: { gte: since },
      role: Role.USER,
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const countsByDate = new Map<string, number>();

  for (let i = 0; i <= days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    countsByDate.set(key, 0);
  }

  for (const msg of messages) {
    const key = msg.createdAt.toISOString().slice(0, 10);
    if (countsByDate.has(key)) {
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }
  }

  return Array.from(countsByDate.entries()).map(([date, count]) => ({
    date,
    count,
  }));
}
