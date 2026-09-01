'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { scoreFileCommand } from '@/features/documents/services/commands/score-file-command';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

export async function scoreDocumentAction(fileId: string): Promise<RagScore> {
  const orgId = await getOrgIdFromAuthOrThrow();
  return scoreFileCommand(fileId, orgId);
}
