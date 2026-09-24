import { CHUNK_SETTINGS } from '../../utils/splitters.js';
import { FileType } from '../../types/UserFile.js';
import { logger } from '../../services/logger.js';
import { qdrantService } from '../../services/qdrant.js';
import { splitPdfDocuments } from '../../services/text-splitters/pdf-section-splitter.js';
import {
  completePublication,
  currentPublicationGeneration,
  getPageForPublication,
} from '../../services/db/brain-publication.js';
import { addDocumentsToVectorStore } from '../meilisearch/add-documents-to-vector-store.js';
import { prepareMetadata } from '../embeddings/prepare-metadata.js';

export type PublishKnowledgePageResult =
  /** Chunks written and the file marked COMPLETED. */
  | { status: 'published'; chunks: number }
  /** Another publish or an unpublish moved the generation on; nothing left behind. */
  | { status: 'stale'; chunks: 0 }
  /** No such page, or it has no publication file. */
  | { status: 'missing'; chunks: 0 };

/**
 * Write one knowledge page's chunks (spec E2), after the web's transaction
 * has bumped the generation, set `publishedAt` and recorded the decision.
 *
 * - **Access is the page's, verbatim.** The chunks carry `accessibleBy` as
 *   curated, never the file's computed principals: `prepareMetadata` is
 *   handed the page's list, so nothing about the vehicle file — its owner,
 *   its folder — can widen who retrieves the page.
 * - **The generation is checked before and after the write.** A run whose
 *   generation is stale writes nothing; one that went stale while writing
 *   deletes what it wrote. Either way retrieval can never hold chunks of a
 *   page its own row says is not published — the order the spec requires.
 * - **Idempotent**: the file's previous chunks are deleted first, so a retry
 *   or a republish converges on exactly one set.
 *
 * Chunk boundaries are decided here, not by ingest: one section per page,
 * titled with the page's title, split only if it outgrows the markdown chunk
 * size. That is the manifest's `chunking: 'predefined'`.
 */
export async function publishKnowledgePage(input: {
  orgId: string;
  pageId: string;
  generation: number;
}): Promise<PublishKnowledgePageResult> {
  const { orgId, generation } = input;
  const page = await getPageForPublication(orgId, input.pageId);
  if (!page || !page.publishedFileId) {
    return { status: 'missing', chunks: 0 };
  }
  if (!page.publishedAt || page.publicationGeneration !== generation) {
    return { status: 'stale', chunks: 0 };
  }
  const fileId = page.publishedFileId;

  await qdrantService.deleteByFileId({ orgId, fileId });

  const settings = CHUNK_SETTINGS[FileType.MARKDOWN];
  const docs = splitPdfDocuments(
    [
      {
        pageContent: page.content,
        metadata: { sectionPath: page.title, source: 'brain' },
      },
    ],
    settings,
  );
  const prepared = await prepareMetadata({
    docs,
    fileRecord: {
      id: fileId,
      fileName: page.fileName ?? `${page.title}.md`,
      organizationId: orgId,
      projectId: null,
      accessibleBy: page.accessibleBy,
    },
    fileType: FileType.MARKDOWN,
    splitterSettings: settings,
  });
  await addDocumentsToVectorStore({ orgId, projectId: null, docs: prepared });

  const still = await currentPublicationGeneration(orgId, page.id);
  if (still !== generation) {
    // Lost the race after writing: take back what this run put in.
    await qdrantService.deleteByFileId({ orgId, fileId });
    logger.info(
      { orgId, pageId: page.publicId, generation, current: still },
      'brain publish: generation moved on while writing; chunks removed',
    );
    return { status: 'stale', chunks: 0 };
  }
  const completed = await completePublication({
    orgId,
    pageId: page.id,
    fileId,
    generation,
  });
  if (!completed) {
    await qdrantService.deleteByFileId({ orgId, fileId });
    return { status: 'stale', chunks: 0 };
  }
  logger.info(
    { orgId, pageId: page.publicId, generation, chunks: prepared.length },
    'brain publish: page is in the index',
  );
  return { status: 'published', chunks: prepared.length };
}
