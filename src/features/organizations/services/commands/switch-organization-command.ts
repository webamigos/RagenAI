'use server';

import { getSessionOrThrow } from '@/lib/auth-guards';
import { revalidatePath } from 'next/cache';

export async function switchOrganizationCommand(organizationId: string) {
  if (!organizationId?.trim()) {
    throw new Error('Organization ID is required');
  }

  await getSessionOrThrow();

  revalidatePath('/');
}
