'use server';

import { requireAppAdmin } from '@/lib/auth-guards';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import {
  encryptThreadsCommand,
  encryptAllThreadsCommand,
  type EncryptThreadsResult,
} from '@/features/threads/services/commands/encrypt-threads-command';

/**
 * Encrypt all unencrypted threads for the current user's organization.
 * Requires app admin role.
 */
export async function encryptOrgThreadsAction(): Promise<EncryptThreadsResult> {
  await requireAppAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  return encryptThreadsCommand(orgId);
}

/**
 * Encrypt all unencrypted threads across all organizations.
 * Requires app admin role.
 */
export async function encryptAllThreadsAction(): Promise<EncryptThreadsResult> {
  await requireAppAdmin();
  return encryptAllThreadsCommand();
}
