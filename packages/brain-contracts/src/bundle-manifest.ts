import { z } from 'zod';

import { bundlePathSchema, contentHashSchema } from './primitives';

/**
 * The format version this package writes and reads. A bundle is kept by the
 * customer, possibly for years, so a reader must be able to tell which shape
 * it is holding before it parses anything else.
 */
export const BUNDLE_FORMAT_VERSION = 1;

export const bundlePageEntrySchema = z.object({
  /** The page's `publicId`, equal to the `id` in its frontmatter. */
  id: z.uuid(),
  path: bundlePathSchema.refine((p) => p.endsWith('.md'), {
    message: 'a page is a markdown file',
  }),
  /**
   * Per-page hash, so re-publication and re-import diff rather than re-embed
   * everything (spec E7).
   */
  contentHash: contentHashSchema,
});
export type BundlePageEntry = z.infer<typeof bundlePageEntrySchema>;

/**
 * `manifest.json` at the root of an exported bundle.
 *
 * `chunking: 'predefined'` is the instruction to an importer that each page is
 * one chunk as written — Brain decided the boundaries, and re-splitting would
 * cut a curated statement away from the citation that supports it. It is a
 * literal because no other value exists; a second one is a new format version.
 */
export const bundleManifestSchema = z
  .object({
    formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
    organizationId: z.string().trim().min(1),
    generatedAt: z.iso.datetime({ offset: true }),
    chunking: z.literal('predefined'),
    graph: bundlePathSchema.refine((p) => p.endsWith('.json'), {
      message: 'the graph is a JSON file',
    }),
    pages: z.array(bundlePageEntrySchema),
  })
  .refine((m) => new Set(m.pages.map((p) => p.id)).size === m.pages.length, {
    message: 'each page appears in the manifest once',
    path: ['pages'],
  })
  .refine((m) => new Set(m.pages.map((p) => p.path)).size === m.pages.length, {
    message: 'two pages cannot share a path',
    path: ['pages'],
  })
  .refine((m) => m.pages.every((p) => p.path !== m.graph), {
    message: 'a page cannot be written over the graph',
    path: ['graph'],
  });
export type BundleManifest = z.infer<typeof bundleManifestSchema>;
