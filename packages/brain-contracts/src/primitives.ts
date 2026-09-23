import { z } from 'zod';

/**
 * An `accessible_by` principal, in the shape `computeFileAccessPrincipals`
 * (packages/rag-core/src/document-access.ts) already writes onto every chunk:
 * `org:<id>`, `user:<id>` or `team:<id>`.
 *
 * Checked here rather than trusted because a page's principals are copied
 * verbatim into the chunk payload at publication, and retrieval matches them
 * as exact strings. `team :abc` or `group:abc` would not fail anywhere — it
 * would simply match nobody, and the page would be published to no one while
 * every screen said otherwise.
 */
export const principalSchema = z
  .string()
  .regex(
    /^(org|user|team):[^\s:]+$/,
    'a principal is org:<id>, user:<id> or team:<id>',
  );
export type Principal = z.infer<typeof principalSchema>;

/**
 * A content hash, algorithm-prefixed so a future change of algorithm is a new
 * prefix rather than a silent reinterpretation of old values.
 */
export const contentHashSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, 'a hash is sha256:<64 lowercase hex>');

/**
 * ISO-8601 duration, the unit of `verifyEvery` — `P3M`, `P1Y`, `P2W`, `PT12H`.
 * A bare `P` or `PT` names no interval and is refused.
 */
export const isoDurationSchema = z
  .string()
  .regex(
    /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/,
    'an ISO-8601 duration, e.g. P3M',
  );

/**
 * A path inside a bundle. Relative, forward-slashed, and never climbing out:
 * a bundle is something a customer can hand back to us for import, and a
 * manifest naming `../../.env.local` is the one kind of entry an importer must
 * not have to remember to refuse.
 */
export const bundlePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p), {
    message: 'a bundle path is relative',
  })
  .refine((p) => !p.includes('\\'), {
    message: 'a bundle path uses forward slashes',
  })
  .refine((p) => p.split('/').every((part) => part !== '..' && part !== ''), {
    message: 'a bundle path does not climb out of the bundle',
  })
  // `pages/./item.md` names the file `pages/item.md` names, and the
  // manifest's uniqueness check compares strings: allowed, the two would be
  // two pages written to one file. One spelling per file.
  .refine((p) => p.split('/').every((part) => part !== '.'), {
    message: 'a bundle path has no "." segments',
  });
