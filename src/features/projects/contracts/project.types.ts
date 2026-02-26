import type { Project } from '@/generated/prisma/client';

export type ProjectPublicFields = Pick<
  Project,
  | 'public_id'
  | 'title'
  | 'created_at'
  | 'updated_at'
  | 'organization_id'
  | 'owner_id'
  | 'is_public'
  | 'access_token'
  | 'published_at'
  | 'chatbot_enabled'
  | 'source'
> & {
  threads: unknown[];
};

export type PublicProjectDto = {
  organizationId: string;
  projectId: number;
  title: string;
};
