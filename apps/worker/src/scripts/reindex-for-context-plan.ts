/**
 * The decisions behind `reindex-for-context.ts`, kept apart from its I/O so
 * they are tested without a stack (spec 2026-09-29-contextual-chunks, C2).
 */

/** A point as the script reads it: only the fields the plan needs. */
export interface ContextPoint {
  payload?: Record<string, unknown> | null;
}

export interface ReindexArgs {
  orgId: string;
  dryRun: boolean;
  limit: number;
}

export function parseReindexArgs(argv: readonly string[]): ReindexArgs {
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

  const orgId = operand('--org');
  if (!orgId) {
    throw new Error(
      '--org <organizationId> is required: one organization at a time',
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

  return { orgId, dryRun: argv.includes('--dry-run'), limit };
}

/**
 * Each file's context version: the lowest over its body chunks, where a
 * chunk without `context_version` is 0. The summary chunk is never prefixed
 * (it is the document-level context already), so it does not count. One
 * stale chunk makes the file stale, because retrieval reads chunks, not
 * files.
 */
export function fileContextVersions(
  points: readonly ContextPoint[],
): Map<string, number> {
  const versions = new Map<string, number>();
  for (const point of points) {
    const metadata = point.payload?.metadata as
      Record<string, unknown> | undefined;
    const fileId = metadata?.file_id;
    if (
      !metadata ||
      typeof fileId !== 'string' ||
      metadata.chunk_type === 'summary'
    ) {
      continue;
    }
    const raw = metadata.context_version;
    const version =
      typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0;
    versions.set(fileId, Math.min(versions.get(fileId) ?? version, version));
  }
  return versions;
}

/** Files per context version, lowest first: `{ 0: 12, 1: 30 }`. */
export function countByVersion(
  versions: ReadonlyMap<string, number>,
): [number, number][] {
  const counts = new Map<number, number>();
  for (const version of versions.values()) {
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a - b);
}

export function renderVersionCounts(
  counts: readonly [number, number][],
): string {
  if (counts.length === 0) {
    return '  (no indexed files)';
  }
  return counts
    .map(
      ([version, files]) =>
        `  context_version ${version === 0 ? '0 (none)' : version}: ${files} file${files === 1 ? '' : 's'}`,
    )
    .join('\n');
}

/** A file as the database has it, with its document's active version. */
export interface ReindexCandidate {
  id: string;
  fileName: string;
  projectId: string | null;
  documentId: string | null;
  /** `changeType` of the document's active version; null when none. */
  activeChangeType: string | null;
}

export type ReindexStep =
  | { fileId: string; job: 'runFileEmbeddings' }
  | {
      fileId: string;
      job: 'reindexDocumentVersion';
      fileName: string;
      projectId: string | null;
      documentId: string;
    };

/**
 * Which job re-indexes each stale file.
 *
 * `runFileEmbeddings` re-parses the stored file, which still holds the
 * original upload — right for a file nobody edited, and wrong for one whose
 * active version came from an edit, an optimization or a rollback: that
 * would put the reverted text back in the index (AGENTS.md). Those go
 * through `reindexDocumentVersion`, which embeds the version's text. A file
 * in the index with no row in the database is skipped: there is nothing to
 * re-index it from.
 */
export function planReindex(
  versions: ReadonlyMap<string, number>,
  candidates: readonly ReindexCandidate[],
  { current, limit = Infinity }: { current: number; limit?: number },
): { steps: ReindexStep[]; missing: number } {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const steps: ReindexStep[] = [];
  let missing = 0;
  for (const [fileId, version] of versions) {
    if (version >= current) {
      continue;
    }
    const file = byId.get(fileId);
    if (!file) {
      missing += 1;
      continue;
    }
    if (steps.length >= limit) {
      continue;
    }
    const edited =
      file.documentId !== null &&
      file.activeChangeType !== null &&
      file.activeChangeType !== 'UPLOAD';
    steps.push(
      edited
        ? {
            fileId,
            job: 'reindexDocumentVersion',
            fileName: file.fileName,
            projectId: file.projectId,
            documentId: file.documentId as string,
          }
        : { fileId, job: 'runFileEmbeddings' },
    );
  }
  return { steps, missing };
}
