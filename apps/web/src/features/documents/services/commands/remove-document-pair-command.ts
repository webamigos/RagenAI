import 'server-only';

import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { assertCanManageDocuments } from '@/features/subscriptions/services/feature-guards';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { UnauthorizedException } from '@/libs/utils/errors';
import {
  fileAccessWhere,
  type DocumentActor,
} from '../queries/document-access';

export type RemoveDocumentPairResult =
  { ok: true } | { ok: false; error: 'not-found' };

/**
 * Unlink a file from its counterpart. Neither file is touched. Needs access
 * to both, like creating one: a pair whose far end the actor cannot read is
 * "not found", so removing it cannot be used to learn that it exists.
 */
export async function removeDocumentPairCommand(input: {
  organizationId: string;
  actor: DocumentActor;
  fileId: string;
}): Promise<RemoveDocumentPairResult> {
  const { organizationId, actor, fileId } = input;

  if (!(await isFeatureEnabledQuery(organizationId, 'languagePairs'))) {
    throw new UnauthorizedException(
      'This organization cannot pair documents by language',
    );
  }
  await assertCanManageDocuments(organizationId);

  const pair = await db.documentPair.findFirst({
    where: {
      organizationId,
      OR: [{ fileAId: fileId }, { fileBId: fileId }],
    },
    select: { id: true, fileAId: true, fileBId: true },
  });
  if (!pair || !actor.userId) {
    return { ok: false, error: 'not-found' };
  }

  const readable = await db.userFile.count({
    where: {
      organizationId,
      id: { in: [pair.fileAId, pair.fileBId] },
      ...fileAccessWhere(actor),
    },
  });
  if (readable !== 2) {
    return { ok: false, error: 'not-found' };
  }

  await db.documentPair.deleteMany({
    where: { id: pair.id, organizationId },
  });
  trackAudit({
    action: 'document.unpaired',
    entityType: 'document',
    entityId: pair.id,
    oldData: { fileAId: pair.fileAId, fileBId: pair.fileBId },
  });
  return { ok: true };
}
