'use server';

import { cookies } from 'next/headers';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { createPublicLinkCommand } from '@/features/threads/services/commands/create-public-link-command';
import { revokePublicLinkCommand } from '@/features/threads/services/commands/revoke-public-link-command';
import { getPublicLinkQuery } from '@/features/threads/services/queries/get-public-link-query';
import { getUserPublicLinksQuery } from '@/features/threads/services/queries/get-user-public-links-query';
import { getPublicThreadQuery } from '@/features/threads/services/queries/get-public-thread-query';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

export async function createPublicLinkAction(
  threadId: string,
  expiresAt: Date | null,
  password?: string,
): Promise<
  { success: true; publicId: string } | { success: false; error: string }
> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }
  const organizationId = await getOrgIdFromAuthOrThrow();

  return createPublicLinkCommand({
    threadId,
    organizationId,
    currentUserId: userId,
    expiresAt,
    password,
  });
}

export async function revokePublicLinkAction(
  threadId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }
  const organizationId = await getOrgIdFromAuthOrThrow();

  return revokePublicLinkCommand({
    threadId,
    currentUserId: userId,
    organizationId,
  });
}

export async function getPublicLinkAction(
  threadId: string,
): Promise<PublicLinkDto | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }

  return getPublicLinkQuery(threadId, userId);
}

export async function getUserPublicLinksAction(): Promise<PublicLinkDto[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  return getUserPublicLinksQuery(userId);
}

export async function verifyPublicLinkPasswordAction(
  publicId: string,
  password: string,
): Promise<{ valid: boolean }> {
  const result = await getPublicThreadQuery({
    publicId,
    submittedPassword: password,
  });

  if (result.status === 'ok') {
    const cookieStore = await cookies();
    cookieStore.set(`thread-pwd-${publicId}`, password, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { valid: true };
  }

  return { valid: false };
}
