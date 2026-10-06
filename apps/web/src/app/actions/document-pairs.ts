'use server';

import { getOrgIdFromAuthOrThrow } from '../lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { canManageOrg } from '@/lib/auth-access-control';
import { getDocumentActor } from '@/features/documents/services/queries/get-document-actor';
import {
  createDocumentPairCommand,
  type CreateDocumentPairResult,
} from '@/features/documents/services/commands/create-document-pair-command';
import {
  removeDocumentPairCommand,
  type RemoveDocumentPairResult,
} from '@/features/documents/services/commands/remove-document-pair-command';
import {
  suggestDocumentPairsQuery,
  type PairSuggestion,
} from '@/features/documents/services/queries/suggest-document-pairs-query';

/**
 * The caller is always the session's user and organization; neither is read
 * from the arguments. A caller who is not a member is an actor with no scope
 * and may manage nothing.
 */
async function caller() {
  const organizationId = await getOrgIdFromAuthOrThrow();
  const [actor, member] = await Promise.all([
    getDocumentActor(organizationId),
    getActiveMember(organizationId).catch(() => null),
  ]);
  return {
    organizationId,
    actor,
    canManageOrg: member ? canManageOrg(member.role) : false,
  };
}

/** Link two files as the same document in two languages (ADR-54). */
export async function createDocumentPairAction(
  fileId: string,
  counterpartFileId: string,
): Promise<CreateDocumentPairResult> {
  return createDocumentPairCommand({
    ...(await caller()),
    fileId,
    counterpartFileId,
  });
}

/** Unlink a file from its counterpart. Neither file is changed. */
export async function removeDocumentPairAction(
  fileId: string,
): Promise<RemoveDocumentPairResult> {
  return removeDocumentPairCommand({ ...(await caller()), fileId });
}

/** Files that may be this file's counterpart. A person still has to confirm. */
export async function suggestDocumentPairsAction(
  fileId: string,
): Promise<PairSuggestion[]> {
  return suggestDocumentPairsQuery({ ...(await caller()), fileId });
}
