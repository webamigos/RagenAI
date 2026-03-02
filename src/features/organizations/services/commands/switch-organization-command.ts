'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireAppAdmin } from '@/lib/auth-guards';
import { revalidatePath } from 'next/cache';

export async function switchOrganizationCommand(organizationId: string) {
  if (!organizationId?.trim()) {
    throw new Error('Organization ID is required');
  }

  await requireAppAdmin();

  await auth.api.setActiveOrganization({
    body: { organizationId },
    headers: await headers(),
  });

  revalidatePath('/');
}
