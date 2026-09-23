import { CHUNK_SETTINGS } from '../../utils/splitters.js';
import { FileType } from '../../types/UserFile.js';
import { logger } from '../../services/logger.js';
import { qdrantService } from '../../services/qdrant.js';
import { splitPdfDocuments } from '../../services/text-splitters/pdf-section-splitter.js';
import {
  completePublication,
  currentPublicationGeneration,
  getPageForPublication,
  markPublicationFailed as markFailed,
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
 * - **Idempotent**: the file's chunks of this and older generations are
 *   deleted first, so a retry or a republish converges on exactly one set.
 *   Every chunk carries `brain_generation`, and every delete here is scoped
 *   by it, so a stale run never removes what a newer one wrote.
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
  const fileId = page.publishedFileId;
  if (!page.publishedAt) {
    // Withdrawn since this run was queued. Nothing of this file belongs in
    // the index, and an earlier attempt of this same run may have written
    // before failing — take it all out rather than leave it retrievable.
    await qdrantService.deleteByFileId({ orgId, fileId });
    return { status: 'stale', chunks: 0 };
  }
  if (page.publicationGeneration !== generation) {
    // A newer run owns the file now; touching its chunks is its business.
    return { status: 'stale', chunks: 0 };
  }

  // Clear this generation's and older chunks, never a newer run's: an
  // access change can bump the generation and its run can write between
  // the check above and this line.
  await qdrantService.deleteBrainChunks({
    orgId,
    fileId,
    generation,
    scope: 'upTo',
  });

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
  // Stamped with the generation, so a rollback below removes exactly these.
  const stamped = prepared.map((doc) => ({
    ...doc,
    metadata: { ...doc.metadata, brain_generation: generation },
  }));
  await addDocumentsToVectorStore({ orgId, projectId: null, docs: stamped });

  const still = await currentPublicationGeneration(orgId, page.id);
  if (still !== generation) {
    // Lost the race after writing: take back what this run put in — only
    // that. Deleting by file removed the newer run's chunks too, leaving a
    // page marked published and complete with nothing in the index.
    await qdrantService.deleteBrainChunks({
      orgId,
      fileId,
      generation,
      scope: 'only',
    });
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
    await qdrantService.deleteBrainChunks({
      orgId,
      fileId,
      generation,
      scope: 'only',
    });
    return { status: 'stale', chunks: 0 };
  }
  logger.info(
    { orgId, pageId: page.publicId, generation, chunks: prepared.length },
    'brain publish: page is in the index',
  );
  return { status: 'published', chunks: prepared.length };
}

/**
 * Record that a page's publication gave up after its retries, so the panel
 * says so and offers to publish again. Its own step: the handler calls it
 * once `publishKnowledgePage` has failed for the last time.
 */
export async function markPublicationFailed(input: {
  orgId: string;
  pageId: string;
  generation: number;
}): Promise<{ marked: boolean }> {
  const marked = await markFailed({
    orgId: input.orgId,
    pagePublicId: input.pageId,
    generation: input.generation,
  });
  return { marked };
}
