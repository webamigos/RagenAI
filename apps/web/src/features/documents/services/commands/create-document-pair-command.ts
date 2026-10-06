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
import { orderPairIds } from '../../utils/document-pair';
import { NOT_A_BRAIN_VEHICLE } from './not-a-brain-vehicle';

export type CreateDocumentPairResult =
  | { ok: true; pairId: string }
  | { ok: false; error: 'same-file' | 'not-found' | 'already-paired' };

/**
 * Link two files of the caller's organization as the same document in two
 * languages (ADR-54). A person confirms it; nothing calls this on its own.
 *
 * Both files must be ones the actor can read, found by `organizationId` and
 * `fileAccessWhere`, and neither may be a Brain publication vehicle. A file
 * the actor cannot read is "not found", never "forbidden": a name alone
 * confirms a document exists.
 *
 * "At most one pair per file" spans two columns, which the schema cannot
 * express, so both file rows are locked in id order and the check runs under
 * the lock. Two people pairing the same file at once queue instead of both
 * succeeding.
 */
export async function createDocumentPairCommand(input: {
  organizationId: string;
  actor: DocumentActor;
  fileId: string;
  counterpartFileId: string;
}): Promise<CreateDocumentPairResult> {
  const { organizationId, actor } = input;

  if (!(await isFeatureEnabledQuery(organizationId, 'languagePairs'))) {
    throw new UnauthorizedException(
      'This organization cannot pair documents by language',
    );
  }
  await assertCanManageDocuments(organizationId);

  const ordered = orderPairIds(input.fileId, input.counterpartFileId);
  if (!ordered || !actor.userId) {
    return { ok: false, error: ordered ? 'not-found' : 'same-file' };
  }
  const [fileAId, fileBId] = ordered;

  const result = await db.$transaction(
    async (tx): Promise<CreateDocumentPairResult> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM user_files
        WHERE organization_id = ${organizationId}
          AND id IN (${fileAId}::uuid, ${fileBId}::uuid)
        ORDER BY id
        FOR UPDATE
      `;
      if (locked.length !== 2) {
        return { ok: false, error: 'not-found' };
      }

      const readable = await tx.userFile.findMany({
        where: {
          organizationId,
          id: { in: [fileAId, fileBId] },
          ...fileAccessWhere(actor),
          ...NOT_A_BRAIN_VEHICLE,
        },
        select: { id: true },
      });
      if (readable.length !== 2) {
        return { ok: false, error: 'not-found' };
      }

      const existing = await tx.documentPair.findFirst({
        where: {
          organizationId,
          OR: [
            { fileAId: { in: [fileAId, fileBId] } },
            { fileBId: { in: [fileAId, fileBId] } },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        return { ok: false, error: 'already-paired' };
      }

      const pair = await tx.documentPair.create({
        data: {
          organizationId,
          fileAId,
          fileBId,
          createdById: actor.userId,
        },
        select: { id: true },
      });
      return { ok: true, pairId: pair.id };
    },
  );

  if (result.ok) {
    trackAudit({
      action: 'document.paired',
      entityType: 'document',
      entityId: result.pairId,
      newData: { fileAId, fileBId },
    });
  }
  return result;
}
