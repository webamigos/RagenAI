import db from '@ragenai/prisma-client';
import type { ApiContext } from '../types/ApiContext';
import { parseResponse } from '../filters/replace-ids.filter';

export async function getApiUserThreadsQuery(context: ApiContext) {
  const threads = await db.thread.findMany({
    where: {
      organization_id: context.orgId,
      project_id: context.projectId,
      OR: [{ user_id: context.userId }, { visitor_id: context.userId }],
    },
    select: {
      public_id: true,
      title: true,
      source: true,
      created_at: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  return parseResponse(threads);
}

export async function getApiUserThreadQuery(
  context: ApiContext,
  publicId: string
) {
  const document = await db.thread.findFirst({
    where: {
      public_id: publicId,
      organization_id: context.orgId,
      project_id: context.projectId,
      OR: [{ user_id: context.userId }, { visitor_id: context.userId }],
    },
    select: {
      public_id: true,
      title: true,
      source: true,
      created_at: true,
    },
  });

  return parseResponse(document);
}

export async function getApiChatMessagesQuery(
  context: ApiContext,
  publicThreadId: string
) {
  const messages = await db.message.findMany({
    where: {
      thread: {
        organization_id: context.orgId,
        public_id: publicThreadId,
        OR: [{ user_id: context.userId }, { visitor_id: context.userId }],
      },
    },
    select: {
      public_id: true,
      created_at: true,
      role: true,
      content: true,
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  return parseResponse(messages);
}
