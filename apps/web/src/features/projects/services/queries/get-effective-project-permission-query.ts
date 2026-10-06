'use server';

import { getActiveMember } from '@/lib/auth-guards';
import { resolveProjectPermissionForMember } from './resolve-project-permission-for-member';

export async function getEffectiveProjectPermissionQuery(
  projectId: string,
  organizationId: string,
  userId: string,
) {
  const member = await getActiveMember(organizationId).catch(() => null);
  return resolveProjectPermissionForMember(
    projectId,
    organizationId,
    userId,
    member?.role,
  );
}
