import db from '@ragenai/prisma-client';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/client';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  CONTEXT_VERSION_PAYLOAD_FIELDS,
  CURRENT_CONTEXT_VERSION,
  fileContextVersions,
} from '@ragenai/rag-core';

const PAGE = 1000;

/** What the knowledge-base settings show about contextual chunks. */
export interface ContextVersionStatus {
  /** Files in the index that the organization still has a row for. */
  indexed: number;
  /** Of those, the ones below the current context version a re-index may start. */
  stale: number;
  /**
   * Below the current version but already queued or being processed — by a
   * re-index started a moment ago, or an upload. Not offered again: their
   * version only moves when the job finishes.
   */
  reindexing: number;
  /** The `stale` files' ids, for the re-index; never sent to the client. */
  staleFileIds: string[];
}

/** A file whose ingest is queued or running; starting another would duplicate it. */
export const INGEST_IN_PROGRESS: {
  parsing: ParsingStatus[];
  embedding: EmbeddingStatus[];
} = {
  parsing: [ParsingStatus.NOT_STARTED, ParsingStatus.STARTED],
  embedding: [EmbeddingStatus.NOT_STARTED, EmbeddingStatus.STARTED],
};

export function isIngestInProgress(file: {
  parsingStatus: ParsingStatus;
  embeddingStatus: EmbeddingStatus;
}): boolean {
  return (
    INGEST_IN_PROGRESS.parsing.includes(file.parsingStatus) ||
    INGEST_IN_PROGRESS.embedding.includes(file.embeddingStatus)
  );
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
 * it, and the row lookup filters on it. Each scroll page is folded into the
 * per-file versions as it arrives, so memory grows with files, not chunks.
 */
export async function getContextVersionStatusQuery(
  organizationId: string,
  qdrant: Pick<QdrantClient, 'collectionExists' | 'scroll'> = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  }),
): Promise<ContextVersionStatus> {
  if (!(await qdrant.collectionExists(organizationId)).exists) {
    return { indexed: 0, stale: 0, reindexing: 0, staleFileIds: [] };
  }

  const versions = new Map<string, number>();
  let offset: string | number | undefined;
  do {
    const page = await qdrant.scroll(organizationId, {
      limit: PAGE,
      offset,
      with_payload: { include: [...CONTEXT_VERSION_PAYLOAD_FIELDS] },
      with_vector: false,
    });
    for (const [fileId, version] of fileContextVersions(page.points)) {
      versions.set(fileId, Math.min(versions.get(fileId) ?? version, version));
    }
    const next = page.next_page_offset;
    offset =
      typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);
  const rows = await db.userFile.findMany({
    where: {
      organizationId,
      id: { in: [...versions.keys()] },
      publishedPages: { none: {} },
    },
    select: { id: true, parsingStatus: true, embeddingStatus: true },
  });

  const below = rows.filter(
    (row) => (versions.get(row.id) ?? 0) < CURRENT_CONTEXT_VERSION,
  );
  const staleFileIds = below
    .filter((row) => !isIngestInProgress(row))
    .map((row) => row.id);
  return {
    indexed: rows.length,
    stale: staleFileIds.length,
    reindexing: below.length - staleFileIds.length,
    staleFileIds,
  };
}
