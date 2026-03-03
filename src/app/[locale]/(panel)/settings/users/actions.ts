'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireAppAdmin } from '@/lib/auth-guards';
import { revalidatePath } from 'next/cache';

export async function impersonateUserAction(userId: string) {
  await requireAppAdmin();

  await auth.api.impersonateUser({
    body: { userId },
    headers: await headers(),
  });

  revalidatePath('/');
}

export async function stopImpersonationAction() {
  await requireAppAdmin();

  await auth.api.stopImpersonating({
    headers: await headers(),
  });

  revalidatePath('/');
}
