'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import type { StorageUsage } from '@/features/organizations/contracts/organization.types';

export async function getKnowledgeBaseUsage(): Promise<{
  storageBytes: number;
  pageCount: number;
}> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const usage: StorageUsage = await getStorageUsageQuery(orgId);
  return {
    storageBytes: usage.knowledgeBaseBytes,
    pageCount: usage.knowledgeBasePageCount,
  };
}
