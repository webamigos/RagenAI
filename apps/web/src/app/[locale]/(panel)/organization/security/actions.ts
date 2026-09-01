'use server';

import { revalidatePath } from 'next/cache';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin, getSession } from '@/lib/auth-guards';
import { listSecurityEventsQuery } from '@/features/security/services/queries/list-security-events-query';
import { resolveSecurityEventCommand } from '@/features/security/services/commands/resolve-security-event-command';
import type {
  SecurityEventFilters,
  SecurityEventPaginatedResult,
} from '@/features/security/contracts/security-event.types';

/**
 * List security events scoped to the current org. Org admin only.
 *
 * `organizationId` in the filter is always overwritten with the session's
 * active org — the UI cannot request cross-org data regardless of what it
 * sends, so the scoping guarantee is enforced server-side here and again
 * inside the feature query.
 */
export async function listOrgSecurityEventsAction(
  filters: SecurityEventFilters = {},
): Promise<SecurityEventPaginatedResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  return listSecurityEventsQuery({
    ...filters,
    organizationId: orgId,
  });
}

export async function resolveOrgSecurityEventAction(publicId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const session = await getSession();
  const resolvedBy = session?.user?.email ?? session?.user?.id ?? 'unknown';

  const result = await resolveSecurityEventCommand({
    publicId,
    resolvedBy,
    organizationId: orgId,
  });

  revalidatePath('/organization/security');
  return result;
}
