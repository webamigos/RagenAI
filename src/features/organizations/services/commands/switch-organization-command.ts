'use server';

import { getSessionOrThrow, getActiveMember } from '@/lib/auth-guards';
import { revalidatePath } from 'next/cache';

export async function switchOrganizationCommand(organizationId: string) {
  if (!organizationId?.trim()) {
    throw new Error('Organization ID is required');
  }

  const session = await getSessionOrThrow();

  // Verify user is a member of the target organization
  const member = await getActiveMember(organizationId);
  if (!member) {
    throw new Error('Unauthorized: not a member of this organization');
  }

  revalidatePath('/');
}
