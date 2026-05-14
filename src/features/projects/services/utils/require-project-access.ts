import 'server-only';
import { UnauthorizedException, NotFoundException } from '@/libs/utils/errors';
import { getEffectiveProjectPermissionQuery } from '../queries/get-effective-project-permission-query';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';

type AccessLevel = 'view' | 'manage' | 'owner';

export async function requireProjectAccess(
  projectId: string,
  level: AccessLevel,
): Promise<{ orgId: string; userId: string }> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedException('Not authenticated');
  }

  const perm = await getEffectiveProjectPermissionQuery(
    projectId,
    orgId,
    userId,
  );

  if (!perm.canView) {
    throw new NotFoundException('Project not found');
  }

  if (level === 'manage' && !perm.canManage) {
    throw new UnauthorizedException(
      'You do not have permission to edit this project',
    );
  }

  if (
    level === 'owner' &&
    perm.source !== 'owner' &&
    perm.source !== 'orgAdmin'
  ) {
    throw new UnauthorizedException(
      'Only the project owner can perform this action',
    );
  }

  return { orgId, userId };
}
