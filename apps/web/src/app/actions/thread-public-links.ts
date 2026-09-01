'use server';

import { cookies } from 'next/headers';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import { getPublicThreadQuery } from '@/features/threads/services/queries/get-public-thread-query';
import { generatePublicLinkToken } from '@/libs/crypto/public-link-token';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

type OperationResult = { success: true } | { success: false; error: string };

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

  return ragenApiRequest<
    { success: true; publicId: string } | { success: false; error: string }
  >({
    method: 'POST',
    path: `/v1/internal/threads/${encodeURIComponent(threadId)}/public-link`,
    userId,
    orgId: organizationId,
    body: {
      expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
      password,
    },
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

  return ragenApiRequest<OperationResult>({
    method: 'DELETE',
    path: `/v1/internal/threads/${encodeURIComponent(threadId)}/public-link`,
    userId,
    orgId: organizationId,
  });
}

export async function getPublicLinkAction(
  threadId: string,
): Promise<PublicLinkDto | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  const orgId = await getOrgIdFromAuthOrThrow();

  const { publicLink } = await ragenApiRequest<{
    publicLink: PublicLinkDto | null;
  }>({
    method: 'GET',
    path: `/v1/internal/threads/${encodeURIComponent(threadId)}/public-link`,
    userId,
    orgId,
  });
  return publicLink;
}

export async function getUserPublicLinksAction(): Promise<PublicLinkDto[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  const orgId = await getOrgIdFromAuthOrThrow();

  return ragenApiRequest<PublicLinkDto[]>({
    method: 'GET',
    path: '/v1/internal/threads/public-links',
    userId,
    orgId,
  });
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
    const token = generatePublicLinkToken(publicId);
    cookieStore.set(`thread-pwd-${publicId}`, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24h, matches token TTL
    });
    return { valid: true };
  }

  return { valid: false };
}
