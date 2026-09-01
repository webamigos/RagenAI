'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireAppAdmin } from '@/lib/auth-guards';
import { revalidatePath } from 'next/cache';

export async function stopImpersonationAction() {
  await requireAppAdmin();

  await auth.api.stopImpersonating({
    headers: await headers(),
  });

  revalidatePath('/');
}
