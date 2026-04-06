import db from '@ragenai/prisma-client';
import type { AssistantTemplateUserView } from '../../contracts/assistant-template.types';

export async function getActiveTemplatesQuery(): Promise<
  AssistantTemplateUserView[]
> {
  return db.assistantTemplate.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      iconUrl: true,
    },
    orderBy: { sortOrder: 'asc' },
  });
}
