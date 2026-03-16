import type { Project } from '@/generated/prisma/client';

export type ProjectPublicFields = Pick<
  Project,
  | 'publicId'
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
  projectId: number;
  title: string;
};
