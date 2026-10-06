import 'server-only';

import db from '@ragenai/prisma-client';
import { NO_ACCESS_PRINCIPAL } from '@ragenai/platform-contracts';
import { QdrantVectorStoreClient } from '@/libs/vector-store';
import { createEmbeddingsInstance } from '@/app/lib/services/llm';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { NOT_A_BRAIN_VEHICLE } from '../commands/not-a-brain-vehicle';
import { fileAccessWhere, type DocumentActor } from './document-access';
import {
  manageableFileWhere,
  type PairPiiPolicy,
} from '../../utils/document-pair';

export type PairSuggestion = {
  id: string;
  fileName: string;
  language: string | null;
  piiPolicy: PairPiiPolicy;
};

/** How many summary chunks to read before narrowing to distinct files. */
const SEARCH_DEPTH = 30;
const MAX_SUGGESTIONS = 5;

/**
 * Files that may hold the same document in another language (ADR-54).
 * Computed when asked and never stored, and never a pair: a person confirms
 * one through `createDocumentPairCommand`.
 *
 * The file's own summary is searched against the organization's *summary
 * chunks* (ADR-16), which are retrievable like any chunk and carry the file's
 * language and its `accessible_by`. The vector store is a hint, not the
 * boundary: every candidate is then read back from the database with
 * `organizationId`, `fileAccessWhere` and the right to manage it, so a stale
 * or wrong payload cannot surface a file the caller may not pair. Candidates
 * that are already paired, are Brain vehicles, or share the file's known
 * language are dropped. A file with no summary yields none, rather than a guess
 * from its name.
 */
export async function suggestDocumentPairsQuery(input: {
  organizationId: string;
  actor: DocumentActor;
  canManageOrg: boolean;
  fileId: string;
}): Promise<PairSuggestion[]> {
  const { organizationId, actor, canManageOrg, fileId } = input;
  if (
    !actor.userId ||
    !(await isFeatureEnabledQuery(organizationId, 'languagePairs'))
  ) {
    return [];
  }

  const manageable = manageableFileWhere(actor.userId, canManageOrg);
  const file = await db.userFile.findFirst({
    where: {
      id: fileId,
      organizationId,
      ...fileAccessWhere(actor),
      ...manageable,
      ...NOT_A_BRAIN_VEHICLE,
      pairMembership: { is: null },
    },
    select: { id: true, language: true, metadata: true },
  });
  const summary = (file?.metadata as { summary?: unknown } | null)?.summary;
  if (!file || typeof summary !== 'string' || summary.trim() === '') {
    return [];
  }

  const must: object[] = [
    { key: 'metadata.organization_id', match: { value: organizationId } },
    { key: 'metadata.chunk_type', match: { value: 'summary' } },
  ];
  if (actor.scope !== 'organization') {
    must.push({
      key: 'metadata.accessible_by',
      match_any: {
        values:
          actor.scope === 'none'
            ? [NO_ACCESS_PRINCIPAL]
            : [
                `org:${organizationId}`,
                `user:${actor.userId}`,
                ...actor.teamIds.map((id) => `team:${id}`),
              ],
      },
    });
  }

  const store = new QdrantVectorStoreClient(
    createEmbeddingsInstance({ organizationId, userId: actor.userId }),
    {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: organizationId,
    },
  );
  const hits = await store.similaritySearch(summary, SEARCH_DEPTH, { must });

  const ranked: string[] = [];
  for (const hit of hits) {
    const id = hit.metadata.file_id;
    const language = hit.metadata.language ?? null;
    if (
      typeof id !== 'string' ||
      id === file.id ||
      ranked.includes(id) ||
      (language !== null &&
        file.language !== null &&
        language === file.language)
    ) {
      continue;
    }
    ranked.push(id);
  }
  if (ranked.length === 0) {
    return [];
  }

  const candidates = await db.userFile.findMany({
    where: {
      id: { in: ranked },
      organizationId,
      ...fileAccessWhere(actor),
      ...manageable,
      ...NOT_A_BRAIN_VEHICLE,
      pairMembership: { is: null },
    },
    select: { id: true, fileName: true, language: true, piiPolicy: true },
  });
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  return ranked
    .flatMap((id) => {
      const candidate = byId.get(id);
      return candidate ? [candidate] : [];
    })
    .filter(
      (candidate) =>
        file.language === null ||
        candidate.language === null ||
        candidate.language !== file.language,
    )
    .slice(0, MAX_SUGGESTIONS);
}
