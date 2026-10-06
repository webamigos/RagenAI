import 'server-only';

import db from '@ragenai/prisma-client';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { NOT_A_BRAIN_VEHICLE } from '../commands/not-a-brain-vehicle';
import { fileAccessWhere, type DocumentActor } from './document-access';
import type { PairPiiPolicy } from '../../utils/document-pair';

export type PairedFile = {
  id: string;
  fileName: string;
  language: string | null;
  piiPolicy: PairPiiPolicy;
};

export type DocumentPairEntry = {
  /** The file the caller asked about. */
  fileId: string;
  /** The other half, only when the actor may read it. */
  counterpart: PairedFile;
};

/**
 * The counterpart of each given file, for the files that have one the actor
 * can read (ADR-54). A pair reveals that a counterpart exists, so the far end
 * is looked up with `organizationId` and `fileAccessWhere` like any file: a
 * user who reads only one side sees an unpaired file, with no name and no
 * hint. Empty when the organization has not turned the feature on.
 */
export async function getDocumentPairsQuery(input: {
  organizationId: string;
  actor: DocumentActor;
  fileIds: string[];
}): Promise<DocumentPairEntry[]> {
  const { organizationId, actor, fileIds } = input;
  if (
    fileIds.length === 0 ||
    !actor.userId ||
    !(await isFeatureEnabledQuery(organizationId, 'languagePairs'))
  ) {
    return [];
  }

  // Only files the actor can read may be asked about. Without this, asking
  // about a file they cannot read whose counterpart they can would return that
  // counterpart under the unreadable file's id, which confirms the pairing.
  const readableAsked = await db.userFile.findMany({
    where: {
      organizationId,
      id: { in: fileIds },
      ...fileAccessWhere(actor),
      ...NOT_A_BRAIN_VEHICLE,
    },
    select: { id: true },
  });
  const askedIds = readableAsked.map((file) => file.id);
  if (askedIds.length === 0) {
    return [];
  }

  const pairs = await db.documentPair.findMany({
    where: {
      organizationId,
      OR: [{ fileAId: { in: askedIds } }, { fileBId: { in: askedIds } }],
    },
    select: { fileAId: true, fileBId: true },
  });
  if (pairs.length === 0) {
    return [];
  }

  const asked = new Set(askedIds);
  const links = pairs.flatMap((pair) => {
    const out: { fileId: string; counterpartId: string }[] = [];
    if (asked.has(pair.fileAId)) {
      out.push({ fileId: pair.fileAId, counterpartId: pair.fileBId });
    }
    if (asked.has(pair.fileBId)) {
      out.push({ fileId: pair.fileBId, counterpartId: pair.fileAId });
    }
    return out;
  });

  const counterparts = await db.userFile.findMany({
    where: {
      organizationId,
      id: { in: links.map((link) => link.counterpartId) },
      ...fileAccessWhere(actor),
      ...NOT_A_BRAIN_VEHICLE,
    },
    select: { id: true, fileName: true, language: true, piiPolicy: true },
  });
  const byId = new Map(counterparts.map((file) => [file.id, file]));

  return links.flatMap((link) => {
    const file = byId.get(link.counterpartId);
    return file ? [{ fileId: link.fileId, counterpart: file }] : [];
  });
}
