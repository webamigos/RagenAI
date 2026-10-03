/**
 * The decisions behind `reindex-for-context.ts`, kept apart from its I/O so
 * they are tested without a stack (spec 2026-09-29-contextual-chunks, C2).
 * What counts as a file's version is rag-core's `fileContextVersions`, shared
 * with the knowledge-base settings in apps/web.
 */

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

export interface StartStepDeps<State> {
  newWorkflowId(): string;
  /** The row's run state before the reset; null when the row is gone. */
  readState(fileId: string): Promise<State | null>;
  /** Sets both statuses to NOT_STARTED and the row's run id. */
  reset(fileId: string, workflowId: string): Promise<void>;
  /**
   * Writes `state` back, only while the row still carries `workflowId`, so a
   * restore never overwrites a later producer.
   */
  restore(fileId: string, state: State, workflowId: string): Promise<void>;
  start(step: ReindexStep, workflowId: string): Promise<unknown>;
}

export interface StartReport {
  started: number;
  failed: { fileId: string; error: unknown }[];
}

/**
 * Starts each step. A cancelled file's CANCELLED status is final for the
 * worker's writers, so a new run must begin from NOT_STARTED, and the row
 * carries the run id before the run exists (as every producer does). If the
 * start then fails, the row gets its previous state back — otherwise it shows
 * a pending run that does not exist — and the loop goes on, so the operator
 * learns how many started and which did not.
 */
export async function startReindexSteps<State>(
  steps: readonly ReindexStep[],
  deps: StartStepDeps<State>,
): Promise<StartReport> {
  const report: StartReport = { started: 0, failed: [] };
  for (const step of steps) {
    const previous = await deps.readState(step.fileId);
    if (!previous) {
      report.failed.push({ fileId: step.fileId, error: 'no file row' });
      continue;
    }
    const workflowId = deps.newWorkflowId();
    await deps.reset(step.fileId, workflowId);
    try {
      await deps.start(step, workflowId);
      report.started += 1;
    } catch (error) {
      report.failed.push({ fileId: step.fileId, error });
      try {
        await deps.restore(step.fileId, previous, workflowId);
      } catch (restoreError) {
        report.failed[report.failed.length - 1].error = new AggregateError(
          [error, restoreError],
          'the start failed and the previous status could not be restored',
        );
      }
    }
  }
  return report;
}
