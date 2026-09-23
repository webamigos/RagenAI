import { z } from 'zod';

import {
  contentHashSchema,
  isoDurationSchema,
  principalSchema,
} from './primitives';
import { EXPORTABLE_PAGE_STATUSES, KNOWLEDGE_PAGE_TYPES } from './vocabulary';

/**
 * One source a page cites: the exact span of the exact version a curator read.
 *
 * `documentVersionId` is the anchor, not `fileId` — re-ingesting a corrected
 * PDF moves "p.4 §2" to a different paragraph, and a citation pinned to the
 * file alone would keep claiming a person checked text they never saw.
 * `hash` is the check against that version, not the anchor.
 *
 * `sourceDeletedAt` is set when the file is gone. The entry stays: curated
 * provenance outlives the row it points at, and a renderer omits the source
 * rather than attempting a lookup that cannot succeed.
 */
export const pageSourceSchema = z.object({
  fileId: z.uuid(),
  documentVersionId: z.uuid(),
  span: z.string().trim().min(1),
  hash: contentHashSchema,
  sourceDeletedAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type PageSource = z.infer<typeof pageSourceSchema>;

/**
 * The frontmatter of a knowledge page in an exported bundle.
 *
 * It describes only what may leave Postgres, so several rules that are
 * *states* in the database are *absences* here:
 *
 * - **`owner` is required.** A page nobody vouches for is not exported at all
 *   (D7) — not exported with an empty owner for the consumer to notice.
 * - **`accessibleBy` is non-empty.** An empty list reads as "nobody" to
 *   retrieval and as "unrestricted" to a careless importer; neither is a
 *   decision a person took.
 * - **`status` is `APPROVED` or `STALE`.** Candidates and rejected pages are
 *   not knowledge; see `EXPORTABLE_PAGE_STATUSES`.
 * - **`sources` is non-empty.** A page with no source is a model's claim with
 *   nothing behind it, which is the thing this product exists to prevent.
 *
 * Verification is recorded as a pair: `lastVerifiedAt` and `lastVerifiedBy`
 * are both set or both null, because "verified, by nobody" and "verified by
 * someone, never" are both answers the STALE query would misread.
 */
export const pageFrontmatterSchema = z
  .object({
    /** The page's `publicId` — stable across exports and re-publications. */
    id: z.uuid(),
    slug: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'a slug is lowercase words joined by hyphens',
      ),
    title: z.string().trim().min(1),
    type: z.enum(KNOWLEDGE_PAGE_TYPES),
    status: z.enum(EXPORTABLE_PAGE_STATUSES),
    /** The user who vouches for the page — not whoever uploaded a source. */
    owner: z.string().trim().min(1),
    accessibleBy: z.array(principalSchema).min(1),
    validFrom: z.iso.date().nullable().default(null),
    /** `id` of the page that replaces this one. */
    supersededBy: z.uuid().nullable().default(null),
    verifyEvery: isoDurationSchema.nullable().default(null),
    lastVerifiedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    lastVerifiedBy: z.string().trim().min(1).nullable().default(null),
    contentHash: contentHashSchema,
    sources: z.array(pageSourceSchema).min(1),
  })
  .refine(
    (page) => (page.lastVerifiedAt === null) === (page.lastVerifiedBy === null),
    {
      message:
        'lastVerifiedAt and lastVerifiedBy are set together or not at all',
      path: ['lastVerifiedBy'],
    },
  )
  .refine((page) => page.supersededBy !== page.id, {
    message: 'a page cannot supersede itself',
    path: ['supersededBy'],
  })
  .refine(
    (page) => new Set(page.accessibleBy).size === page.accessibleBy.length,
    {
      message: 'accessibleBy lists each principal once',
      path: ['accessibleBy'],
    },
  );
export type PageFrontmatter = z.infer<typeof pageFrontmatterSchema>;
