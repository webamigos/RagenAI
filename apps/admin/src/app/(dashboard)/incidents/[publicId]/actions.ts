'use server';

import { requireAdmin } from '@/lib/auth-guard';

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
    select: { id: true, resolvedAt: true },
  });
  if (!event || event.resolvedAt) {
    return;
  }

  await prisma.securityEvent.update({
    where: { id: event.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: admin.email,
    },
  });

  revalidatePath(`/incidents/${publicId}`);
  revalidatePath('/incidents');
}
