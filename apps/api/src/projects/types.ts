import type { Project } from '../generated/prisma/client.js';

/**
 * Ported from apps/web's src/features/projects/contracts/{project,
 * project-permission}.types.ts. `events.ts` (a browser CustomEvent name/type
 * for cross-component UI communication) is not ported — not a backend
 * concern. See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
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

export type ProjectPermissionLevel = 'view' | 'full';
export type ProjectGranteeType = 'user' | 'team';

export type ProjectPermissionItem = {
  id: string;
  granteeType: ProjectGranteeType;
  granteeId: string;
  granteeName: string;
  granteeEmail?: string;
  permission: ProjectPermissionLevel;
};

export type EffectiveProjectPermission = {
  canView: boolean;
  canManage: boolean;
  canShare: boolean;
  canDelete: boolean;
  source: 'owner' | 'orgAdmin' | 'directShare' | 'teamShare' | 'none';
};

export type ShareProjectInput = {
  projectId: string;
  granteeType: ProjectGranteeType;
  granteeId: string;
  permission: ProjectPermissionLevel;
};

export type AccessLevel = 'view' | 'manage' | 'owner';
