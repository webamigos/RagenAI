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

export function parseFullReindexArgs(argv: readonly string[]): FullReindexArgs {
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
    line +=
      `; ${brainPages} published Brain page${brainPages === 1 ? '' : 's'} ` +
      'not covered — publish again to return them to search';
  }
  return line;
}
