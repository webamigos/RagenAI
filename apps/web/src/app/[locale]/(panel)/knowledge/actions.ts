'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import { getStorageLimits } from '@/features/organizations/services/organization-settings';
import type { StorageUsage } from '@/features/organizations/contracts/organization.types';

export type KnowledgeBaseUsage = {
  /** Knowledge base files only — what this page is a view of. */
  storageBytes: number;
  /**
   * Every file the organization holds, and the allowance it is measured
   * against.
   *
   * The bar deliberately does not plot `storageBytes`. `storageLimitBytes` is
   * an organization-wide allowance — `upload-file-command` refuses an upload
   * when `totalBytes + file.size` passes it — so a bar drawn from knowledge
   * base bytes alone would sit at a third while the next upload is already
   * being rejected. The bar answers "can I still add a document", and that
   * question is about the total.
   */
  totalBytes: number;
  limitBytes: number;
  pageCount: number;
};

export async function getKnowledgeBaseUsage(): Promise<KnowledgeBaseUsage> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const [usage, limits]: [StorageUsage, { storageLimitBytes: number }] =
    await Promise.all([getStorageUsageQuery(orgId), getStorageLimits(orgId)]);

  return {
    storageBytes: usage.knowledgeBaseBytes,
    totalBytes: usage.totalBytes,
    limitBytes: limits.storageLimitBytes,
    pageCount: usage.knowledgeBasePageCount,
  };
}
