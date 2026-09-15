/**
 * The job names this application starts.
 *
 * Derived from `@ragenai/jobs`, which owns them. This file used to declare its
 * own copy of the task queue name and a one-member subset of apps/web's
 * `Workflow` enum, with a comment saying "keep in sync by hand" — the
 * duplication [ADR-33](../../../../docs/adrs/33-shared-platform-contracts-package.md)
 * and `tests/architecture/shared-contracts-are-not-recopied.test.ts` exist to
 * stop. `satisfies` turns a name that is not a real job into a compile error
 * here rather than a "workflow type not registered" in the worker.
 *
 * The task queue is no longer re-exported: it is the Temporal adapter's, and
 * nothing outside it needs to name a queue now that producers go through
 * `JobsService`.
 */
import type { JobName } from '@ragenai/jobs';

export const Workflow = {
  RUN_FILE_EMBEDDINGS: 'runFileEmbeddings',
} as const satisfies Record<string, JobName>;

export type Workflow = (typeof Workflow)[keyof typeof Workflow];
