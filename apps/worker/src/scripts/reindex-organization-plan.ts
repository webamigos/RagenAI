/**
 * The decisions behind `reindex-organization.ts`, kept apart from its I/O so
 * they are tested without a stack. Which job re-indexes a file is
 * `reindexStepFor`, shared with `reindex-for-context.ts`.
 */

export interface FullReindexArgs {
  /** One organization, or every organization when `allOrgs`. */
  orgId: string | null;
  allOrgs: boolean;
  dryRun: boolean;
  limit: number;
  /** Only files embedded before this moment; null means "before this run". */
  before: Date | null;
}

export function parseFullReindexArgs(
  argv: readonly string[],
  now: Date = new Date(),
): FullReindexArgs {
  const operand = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) {
      return undefined;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} needs a value`);
    }
    return value;
  };

  const orgId = operand('--org') ?? null;
  // `--org ""` is what an unset shell variable turns into. It must not read
  // as "no organization named", which is one step from "all of them".
  if (orgId !== null && orgId.trim() === '') {
    throw new Error('--org needs an organization id, not an empty value');
  }
  const allOrgs = argv.includes('--all-orgs');
  if ((orgId === null) === !allOrgs) {
    throw new Error(
      'name what to re-index: --org <organizationId>, or --all-orgs — one of them, not both',
    );
  }

  const rawLimit = operand('--limit');
  let limit = Infinity;
  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error(
        `--limit must be a positive whole number, not ${rawLimit}`,
      );
    }
  }

  const rawBefore = operand('--before');
  let before: Date | null = null;
  if (rawBefore !== undefined) {
    before = new Date(rawBefore);
    if (Number.isNaN(before.getTime())) {
      throw new Error(
        `--before must be a date and time such as 2026-11-19T01:00:00Z, not ${rawBefore}`,
      );
    }
    // A re-indexed file is told apart by being embedded after the cutoff. A
    // cutoff still ahead never lets one go, and every run would start the
    // same files again.
    if (before.getTime() > now.getTime()) {
      throw new Error(
        `--before must not be in the future (${rawBefore}): it is the moment the model changed`,
      );
    }
  }

  const dryRun = argv.includes('--dry-run');
  // A batch is told apart from the next one by when its files were embedded.
  // Without a fixed cutoff the second batch would pick up the first batch's
  // files again, freshly re-indexed, and the run would never end.
  if (limit !== Infinity && before === null && !dryRun) {
    throw new Error(
      '--limit needs --before <when the model changed>: the cutoff is what ' +
        'keeps the next batch from re-indexing this one again',
    );
  }

  return { orgId, allOrgs, dryRun, limit, before };
}

/**
 * The files a full re-index starts: those the index held, and nothing else.
 *
 * - `COMPLETED` only. `STAGED` and `WITHDRAWN` are deliberately out of the
 *   index, a `NOT_STARTED` or `STARTED` file has a job on its way that will
 *   embed with the new model anyway, and `FAILED` or `CANCELLED` was not in
 *   the index to begin with.
 * - Embedded before the cutoff, so a second run skips what the first one
 *   already re-indexed. A null timestamp predates the column and counts as
 *   before.
 * - Not an import: its search goes through the source file's chunks.
 * - Not a published Brain page's file: it has no stored upload to parse, and
 *   its chunks are written by publishing (the same exclusion as the panel's
 *   bulk Reprocess).
 */
export function fullReindexWhere(organizationId: string, before: Date) {
  return {
    organizationId,
    embeddingStatus: 'COMPLETED' as const,
    sourceFileId: null,
    publishedPages: { none: {} },
    OR: [
      { embeddingCompletedAt: null },
      { embeddingCompletedAt: { lt: before } },
    ],
  };
}

/**
 * The published Brain pages a full re-index writes again.
 *
 * A page's chunks are written by publishing, not by ingest, so its file is
 * left out of `fullReindexWhere`. It is re-embedded by starting the publish
 * job at the page's current generation: the job deletes that generation's
 * chunks and writes them again, and does nothing if the page was withdrawn
 * or republished meanwhile. Publishing stamps the file's
 * `embeddingCompletedAt`, so the same cutoff tells done from not done.
 */
export function brainRepublishWhere(organizationId: string, before: Date) {
  return {
    organizationId,
    publishedAt: { not: null },
    publishedFile: {
      is: {
        organizationId,
        embeddingStatus: 'COMPLETED' as const,
        OR: [
          { embeddingCompletedAt: null },
          { embeddingCompletedAt: { lt: before } },
        ],
      },
    },
  };
}

/** A published page as the plan read it. */
export interface BrainPage {
  publicId: string;
  generation: number;
  fileId: string;
}

/**
 * The file a page's re-publish may mark as being written: still COMPLETED,
 * and its page still published at the generation the plan read. If the page
 * was published again or withdrawn in between, this matches nothing.
 */
export function brainClaimWhere(organizationId: string, page: BrainPage) {
  return {
    id: page.fileId,
    organizationId,
    embeddingStatus: 'COMPLETED' as const,
    publishedPages: {
      some: {
        organizationId,
        publicId: page.publicId,
        publicationGeneration: page.generation,
        publishedAt: { not: null },
      },
    },
  };
}

export function renderOrgPlan({
  orgId,
  steps,
  remaining,
  brainPages,
  dryRun,
}: {
  orgId: string;
  steps: readonly { job: string }[];
  remaining: number;
  brainPages: number;
  dryRun: boolean;
}): string {
  const count = (job: string) => steps.filter((s) => s.job === job).length;
  let line =
    `${orgId}: ${dryRun ? 'would start' : 'starting'} ${steps.length} ` +
    `(${count('runFileEmbeddings')} re-ingest, ` +
    `${count('reindexDocumentVersion')} from an edited version)`;
  if (remaining > 0) {
    line += `; ${remaining} more past --limit`;
  }
  if (brainPages > 0) {
    line += `; ${brainPages} published Brain page${brainPages === 1 ? '' : 's'}`;
  }
  return line;
}
