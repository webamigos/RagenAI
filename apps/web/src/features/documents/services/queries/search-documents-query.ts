import 'server-only';

import db from '@ragenai/prisma-client';
import { fileAccessWhere } from './document-access';
import { getDocumentActor } from './get-document-actor';

export type DocumentSearchResult = {
  id: string;
  fileName: string;
};

/**
 * Files matching a query, for the command palette.
 *
 * **Names only, not content.** Two reasons, and the second is the interesting
 * one. A palette has to answer while someone is still typing, and searching
 * content means an embedding call plus a vector query per keystroke — hundreds
 * of milliseconds and a cost per character. And content search already has a
 * better home: the palette's trailing "Ask …" action, which runs real
 * retrieval and comes back with an answer and citations rather than a list of
 * files. Names navigate; the assistant answers.
 *
 * Access-scoped through the same `fileAccessWhere` the knowledge page uses. A
 * search box is the easiest place in a product to leak the existence of a
 * document — a name is enough to confirm that a contract with a client exists
 * — so this runs the predicate rather than a looser one, and a non-member
 * matches nothing.
 */
export async function searchDocumentsQuery(
  organizationId: string,
  query: string,
  limit = 5,
): Promise<DocumentSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const actor = await getDocumentActor(organizationId);

  const files = await db.userFile.findMany({
    where: {
      organizationId,
      fileName: { contains: trimmed, mode: 'insensitive' },
      ...fileAccessWhere(actor),
    },
    select: { id: true, fileName: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return files.map((file) => ({ id: file.id, fileName: file.fileName }));
}
