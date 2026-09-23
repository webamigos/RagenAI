import 'server-only';

import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

import { canUseBrain } from '../../utils/can-use-brain';

/**
 * The organization the current session may use Brain in, or null — which
 * every Brain route turns into a 404, so a member cannot tell a disabled
 * feature from a missing one.
 */
export async function getBrainAccessQuery(): Promise<{ orgId: string } | null> {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return null;
  }
  const [member, enabled] = await Promise.all([
    getActiveMember(orgId),
    isFeatureEnabledQuery(orgId, 'brain'),
  ]);
  return canUseBrain({ role: member?.role, enabled }) ? { orgId } : null;
}
