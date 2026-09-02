'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function renameOrgAction(orgId: string, name: string) {
  const admin = await requireAdmin();
  if (!name.trim()) {
    throw new Error('Name cannot be empty');
  }

  const before = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { name: name.trim() },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgRenamed,
    entityType: 'organization',
    entityId: orgId,
    organizationId: orgId,
    before: before ?? null,
    after: { name: name.trim() },
  });

  revalidatePath('/organizations');
  revalidatePath(`/organizations/${orgId}`);
}

export async function changeOrgSlugAction(orgId: string, slug: string) {
  const admin = await requireAdmin();
  const trimmed = slug.trim().toLowerCase();

  if (trimmed) {
    const existing = await prisma.organization.findUnique({
      where: { slug: trimmed },
      select: { id: true },
    });
    if (existing && existing.id !== orgId) {
      throw new Error('Slug is already taken');
    }
  }

  const before = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { slug: true },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { slug: trimmed || null },
  });

  // The slug is in customer-facing URLs, so a change here can break links that
  // are already in circulation — worth a security event, not just an audit row.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgSlugChanged,
    entityType: 'organization',
    entityId: orgId,
    organizationId: orgId,
    before: before ?? null,
    after: { slug: trimmed || null },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/organizations');
  revalidatePath(`/organizations/${orgId}`);
}
