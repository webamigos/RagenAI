'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';

/**
 * Change user password
 * Requires current password for security
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  try {
    // 1. Get current session
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return {
        success: false,
        error: 'Nie jesteś zalogowany',
      };
    }

    // 2. Call Better Auth API to change password
    const result = await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: false, // Keep user logged in on other devices
      },
      headers: await headers(),
    });

    if (!result) {
      return {
        success: false,
        error: 'Nieprawidłowe obecne hasło',
      };
    }

    logger.info(`Password changed for user ${session.user.id}`);

    // 3. Revalidate cache
    revalidatePath('/user/profile');

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error changing password:', error);
    return {
      success: false,
      error: 'Wystąpił błąd podczas zmiany hasła',
    };
  }
}

/**
 * Update user profile (name)
 */
export async function updateProfile(name: string) {
  try {
    // 1. Get current session
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return {
        success: false,
        error: 'Nie jesteś zalogowany',
      };
    }

    // 2. Call Better Auth API to update user
    await auth.api.updateUser({
      body: {
        name: name.trim(),
      },
      headers: await headers(),
    });

    logger.info(`Profile updated for user ${session.user.id}`);

    // 3. Revalidate cache
    revalidatePath('/user/profile');

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Error updating profile:', error);
    return {
      success: false,
      error: 'Nie udało się zaktualizować profilu',
    };
  }
}
