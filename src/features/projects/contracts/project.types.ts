import type { Project } from '@/generated/prisma/client';

export type ProjectPublicFields = Pick<
  Project,
  | 'id'
  | 'title'
  | 'createdAt'
  | 'updatedAt'
  | 'organizationId'
  | 'ownerId'
  | 'isPublic'
  | 'accessToken'
  | 'publishedAt'
  | 'chatbotEnabled'
  | 'source'
> & {
  threads: unknown[];
};

export type PublicProjectDto = {
  organizationId: string;
  projectId: string;
  title: string;
};
