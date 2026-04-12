'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Resolve a security incident from the admin app. Passes `undefined` for
 * organizationId so the shared feature command bypasses the cross-org
 * guard — ragen-admin is `@webamigos.pl`-gated and sees all orgs.
 *
 * Note: we duplicate the core update logic here instead of importing the
 * feature command, because cross-importing across monorepo workspaces
 * requires ugly relative paths and the update is trivial. Keep the PII
 * contract (no raw metadata logging) even so.
 */
export async function resolveIncidentAction(formData: FormData): Promise<void> {
  const publicId = String(formData.get('publicId') ?? '').trim();
  if (!publicId) {
    return;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
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
      resolvedBy: session.user.email ?? session.user.id,
    },
  });

  revalidatePath(`/incidents/${publicId}`);
  revalidatePath('/incidents');
}
