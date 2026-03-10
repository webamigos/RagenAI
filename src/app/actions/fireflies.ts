'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getFirefliesConnectorQuery } from '@/features/connectors/services/queries/get-fireflies-connector-query';
import { searchFirefliesTranscriptsQuery } from '@/features/connectors/services/queries/search-fireflies-transcripts-query';
import { getFirefliesTranscriptContentQuery } from '@/features/connectors/services/queries/get-fireflies-transcript-content-query';

export type { FirefliesTranscript } from '@/features/connectors/services/queries/search-fireflies-transcripts-query';

export async function isFirefliesConnected(): Promise<boolean> {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }
    const connector = await getFirefliesConnectorQuery(orgId, userId);
    return connector !== null;
  } catch {
    return false;
  }
}

export async function searchFirefliesTranscripts(query: string = '') {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return searchFirefliesTranscriptsQuery(orgId, userId, query);
}

export async function getFirefliesTranscriptContent(transcriptId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return getFirefliesTranscriptContentQuery(orgId, userId, transcriptId);
}
