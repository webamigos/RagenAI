'use server';

import { getUserThreadsQuery } from './get-user-threads-query';

export async function searchThreadsQuery(
  visitorId: string,
  query: string,
): Promise<{ id: string; title: string }[]> {
  if (!visitorId || !query.trim() || query.trim().length < 3) {
    return [];
  }

  const threads = await getUserThreadsQuery(visitorId, 0, 5, query);

  return threads.map((thread) => ({
    id: thread.publicId,
    title: thread.messages[0]?.content.slice(0, 50) || 'No title',
  }));
}
