import db from '@ragenai/prisma-client';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  CONTEXT_VERSION_PAYLOAD_FIELDS,
  CURRENT_CONTEXT_VERSION,
  fileContextVersions,
  type ContextPoint,
} from '@ragenai/rag-core';

const PAGE = 1000;

/** What the knowledge-base settings show about contextual chunks. */
export interface ContextVersionStatus {
  /** Files in the index that the organization still has a row for. */
  indexed: number;
  /** Of those, the ones below the current context version. */
  stale: number;
  /** Their ids, for the re-index; never sent to the client. */
  staleFileIds: string[];
}

/**
 * The organization's files per context version (spec
 * 2026-09-29-contextual-chunks, C1), read from its Qdrant collection by the
 * rule `reindex-for-context.ts` uses: a file's version is the lowest over its
 * body chunks. Only files the organization has a row for count — a point
 * with no row cannot be re-indexed — and a published Brain page's file is
 * left out, as the bulk re-embed leaves it out: publishing writes its chunks.
 *
 * Scoped by the caller's organization twice: the collection is named after
 * it, and the row lookup filters on it.
 */
export async function getContextVersionStatusQuery(
  organizationId: string,
  qdrant: Pick<QdrantClient, 'collectionExists' | 'scroll'> = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  }),
): Promise<ContextVersionStatus> {
  if (!(await qdrant.collectionExists(organizationId)).exists) {
    return { indexed: 0, stale: 0, staleFileIds: [] };
  }

  const points: ContextPoint[] = [];
  let offset: string | number | undefined;
  do {
    const page = await qdrant.scroll(organizationId, {
      limit: PAGE,
      offset,
      with_payload: { include: [...CONTEXT_VERSION_PAYLOAD_FIELDS] },
      with_vector: false,
    });
    points.push(...page.points);
    const next = page.next_page_offset;
    offset =
      typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);

  const versions = fileContextVersions(points);
  const rows = await db.userFile.findMany({
    where: {
      organizationId,
      id: { in: [...versions.keys()] },
      publishedPages: { none: {} },
    },
    select: { id: true },
  });

  const staleFileIds = rows
    .map((row) => row.id)
    .filter((id) => (versions.get(id) ?? 0) < CURRENT_CONTEXT_VERSION);
  return { indexed: rows.length, stale: staleFileIds.length, staleFileIds };
}
