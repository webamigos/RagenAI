import { z } from 'zod';

import { contentHashSchema, uuidSchema } from './primitives';

/**
 * The `brain` key of `UserFile.metadata` on the file a knowledge page is
 * published through.
 *
 * A published page is an ordinary `UserFile` so that retrieval and the
 * citation tables need no change; this key is the only thing that tells a
 * renderer the file is a page, and the join from it to `KnowledgePageSource`
 * is how a citation gets its second level (spec: "Core surfaces touched").
 *
 * - `pageId` is the page's `publicId`.
 * - `contentHash` is what was embedded, so re-publication skips an unchanged
 *   page (E7).
 * - `publicationGeneration` is the generation the chunks were written under,
 *   so a stale writer can be told apart from the current one (E2/E3).
 *
 * Nested under one key rather than spread across `metadata` because that
 * column already carries parser output, and a field named `pageId` at its top
 * level is one PDF metadata extractor away from a collision.
 */
export const publishedFileMetadataSchema = z.object({
  pageId: uuidSchema,
  contentHash: contentHashSchema,
  publicationGeneration: z.int().nonnegative(),
});
export type PublishedFileMetadata = z.infer<typeof publishedFileMetadataSchema>;

/** The key under `UserFile.metadata` that holds `PublishedFileMetadata`. */
export const PUBLISHED_FILE_METADATA_KEY = 'brain';

/**
 * Read the Brain block off a `UserFile.metadata` value, or `null` when the
 * file is not a published page.
 *
 * `null` for a present-but-malformed block too, not a throw: this is called
 * while rendering a citation, and one hand-edited row must not take an answer
 * down with it. A caller that needs to tell "not a page" from "a broken page"
 * parses the schema itself.
 */
export function readPublishedFileMetadata(
  metadata: unknown,
): PublishedFileMetadata | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const block = (metadata as Record<string, unknown>)[
    PUBLISHED_FILE_METADATA_KEY
  ];
  const parsed = publishedFileMetadataSchema.safeParse(block);
  return parsed.success ? parsed.data : null;
}
