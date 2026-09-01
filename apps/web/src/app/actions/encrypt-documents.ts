'use server';

import { requireAppAdmin } from '@/lib/auth-guards';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import {
  encryptDocumentsCommand,
  encryptAllDocumentsCommand,
  type EncryptDocumentsResult,
} from '@/features/documents/services/commands/encrypt-documents-command';

/**
 * Encrypt all unencrypted documents for the current user's organization.
 * Requires app admin role.
 */
export async function encryptOrgDocumentsAction(): Promise<EncryptDocumentsResult> {
  await requireAppAdmin();
  const orgId = await getOrgIdFromAuthOrThrow();
  return encryptDocumentsCommand(orgId);
}

/**
 * Encrypt all unencrypted documents across all organizations.
 * Requires app admin role.
 */
export async function encryptAllDocumentsAction(): Promise<EncryptDocumentsResult> {
  await requireAppAdmin();
  return encryptAllDocumentsCommand();
}
