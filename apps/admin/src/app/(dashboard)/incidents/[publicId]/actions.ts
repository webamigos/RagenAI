'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

/**
 * Resolve a security incident from the admin app. Passes `undefined` for
 * organizationId so the shared feature command bypasses the cross-org
 * guard — this panel is platform-admin-gated and sees all orgs.
 *
 * Note: we duplicate the core update logic here instead of importing the
 * feature command, because cross-importing across monorepo workspaces
 * requires ugly relative paths and the update is trivial. Keep the PII
 * contract (no raw metadata logging) even so.
 */
export async function resolveIncidentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const publicId = String(formData.get('publicId') ?? '').trim();
  if (!publicId) {
    return;
  }

  const event = await prisma.securityEvent.findUnique({
    where: { publicId },
    select: { id: true, resolvedAt: true, organizationId: true },
  });
  if (!event || event.resolvedAt) {
    return;
  }

  // Claim it conditionally rather than updating by id after the read: two
  // administrators clicking Resolve on the same incident would otherwise both
  // pass the check above and the second would overwrite the first one's name
  // and timestamp. `updateMany` with `resolvedAt: null` in the filter makes the
  // claim atomic, and the count says who won.
  const { count } = await prisma.securityEvent.updateMany({
    where: { id: event.id, resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolvedBy: admin.email,
    },
  });

  if (count === 0) {
    // Somebody else resolved it between the read and the write.
    return;
  }

  // `resolvedBy` already names the administrator on the event itself, so this
  // adds the org-side trail only when the incident belongs to an organization.
  if (event.organizationId) {
    await recordAdminAction({
      admin,
      action: ADMIN_ACTIONS.incidentResolved,
      entityType: 'security_event',
      entityId: publicId,
      organizationId: event.organizationId,
      after: { resolvedBy: admin.email },
    });
  }

  revalidatePath(`/incidents/${publicId}`);
  revalidatePath('/incidents');
}
