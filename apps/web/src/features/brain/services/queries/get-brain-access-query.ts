import 'server-only';

import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { getEffectiveFeaturesQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

import { brainAccess, type BrainAccess } from '../../utils/can-use-brain';

/**
 * The organization the current session may use Brain in, and whether it may
 * change anything there — or null, which every Brain route turns into a 404,
 * so a member cannot tell a disabled feature from a missing one.
 *
 * `canWrite` is false in read-only mode (`manageBrain` off, or a member let in
 * by `brainForMembers`). Pages hide their controls on it; the actions and
 * routes that change anything ask `getBrainWriteAccessQuery` instead, so a
 * hidden button is never the only thing standing in the way.
 */
export async function getBrainAccessQuery(): Promise<{
  orgId: string;
  access: BrainAccess;
  canWrite: boolean;
} | null> {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return null;
  }
  const [member, flags] = await Promise.all([
    getActiveMember(orgId),
    getEffectiveFeaturesQuery(orgId),
  ]);
  const access = brainAccess({ role: member?.role, flags });
  return access ? { orgId, access, canWrite: access === 'write' } : null;
}

/**
 * The organization the current session may *change* Brain in, or null. Every
 * action and route that writes asks this, not `getBrainAccessQuery`.
 */
export async function getBrainWriteAccessQuery(): Promise<{
  orgId: string;
} | null> {
  const access = await getBrainAccessQuery();
  return access?.canWrite ? { orgId: access.orgId } : null;
}
