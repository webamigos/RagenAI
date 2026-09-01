'use server';

import db from '@ragenai/prisma-client';

export async function checkIfAdminExistsQuery(): Promise<boolean> {
  const admin = await db.user.findFirst({
    where: { role: 'admin' },
  });

  return !!admin;
}
