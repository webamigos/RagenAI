'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { scoreFileCommand } from '@/features/documents/services/commands/score-file-command';

export async function scoreDocumentAction(fileId: string): Promise<void> {
  const orgId = await getOrgIdFromAuthOrThrow();
  return scoreFileCommand(fileId, orgId);
}
