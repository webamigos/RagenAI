/**
 * Duplicated from ragen-app's src/libs/temporal/consts.ts (task queue
 * name) and src/features/documents/contracts/document.types.ts
 * (`Workflow` enum — only the member apps/api actually starts). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * apps/api never runs Temporal workflows itself (that's ragen-worker) —
 * it only starts them by name, so per this repo's convention
 * ("Temporal workflows: reference by string name, not function import",
 * see ragen-app's AGENTS.md), keeping just the queue name + workflow
 * type string here is enough. Keep in sync by hand.
 */
export const TASK_QUEUE_NAME = 'ragen-tasks';

export enum Workflow {
  RUN_FILE_EMBEDDINGS = 'runFileEmbeddings',
}
