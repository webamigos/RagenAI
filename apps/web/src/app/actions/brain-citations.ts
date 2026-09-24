'use server';

import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import type { BrainCitations } from '@/features/brain/contracts/brain-citations.types';
import { getBrainCitationsQuery } from '@/features/brain/services/queries/get-brain-citations-query';
import { getDocumentActor } from '@/features/documents/services/queries/get-document-actor';

/**
 * The Brain pages among a turn's cited files, with their sources (spec E8).
 * Organization and reader from the session; an unknown id, a file that is
 * not a published page, and a page the reader may not see all answer nothing.
 * Not gated on the `brain` flag: a published page keeps answering, and
 * citing, after the panel is switched off.
 */
export async function getBrainCitationsAction(
  fileIds: unknown,
): Promise<BrainCitations> {
  if (
    !Array.isArray(fileIds) ||
    !fileIds.every((id) => typeof id === 'string')
  ) {
    return {};
  }
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return {};
  }
  const actor = await getDocumentActor(orgId);
  return getBrainCitationsQuery(orgId, actor, fileIds as string[]);
}
