'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';

export async function updateInitialAdminAccountCommand(
  userId: string
): Promise<OperationResult<{ message: string }>> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const existingAdmin = await db.user.findFirst({
      where: { role: 'admin' },
    });

    if (existingAdmin) {
      return { success: false, error: 'Admin account already exists' };
    }

    await db.user.update({
      where: { id: userId },
      data: {
        role: 'admin',
        emailVerified: true,
      },
    });

    const membership = await db.member.findFirst({
      where: { userId, role: 'owner' },
    });

    if (membership) {
      await db.organization.update({
        where: { id: membership.organizationId },
        data: {
          name: 'Web Amigos',
          slug: 'web-amigos',
        },
      });
    }

    return { success: true, data: { message: 'Admin account created' } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create admin account',
    };
  }
}
