/**
 * Re-exported from `@ragenai/jobs`, which owns these now.
 *
 * This file used to declare its own copy of the queue name and a one-member
 * subset of apps/web's `Workflow` enum, with a comment saying "keep in sync by
 * hand" — the duplication
 * [ADR-33](../../../../docs/adrs/33-shared-platform-contracts-package.md) and
 * `tests/architecture/shared-contracts-are-not-recopied.test.ts` exist to stop.
 * The names live in the seam now, and the task queue belongs to the Temporal
 * adapter that reads it.
 */
import type { JobName } from '@ragenai/jobs';

export { TASK_QUEUE_NAME } from '@ragenai/jobs-temporal';

export const Workflow = {
  RUN_FILE_EMBEDDINGS: 'runFileEmbeddings',
} as const satisfies Record<string, JobName>;

export type Workflow = (typeof Workflow)[keyof typeof Workflow];
