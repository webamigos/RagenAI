/**
 * What is left of `apps/web`'s Temporal client, now that producers go through
 * `@/libs/jobs`.
 *
 * Two consumers remain, and each has a named step that removes it: the cancel
 * command sends a signal, which the seam deliberately does not expose because
 * cancellation becomes a database fact; and the document-generation status
 * route describes a workflow, which `JobRuntime.getRun` already answers. Both
 * are the worker-runtime spec's Phase B, and this directory goes with them.
 *
 * `TASK_QUEUE_NAME`, `TEMPORAL_NAMESPACE`, `targetEnv` and the three
 * `*EmbeddingProcessInput` types were also exported from here and read by
 * nothing once the producers moved; the queue name now has one home, in the
 * adapter.
 *
 * Named re-exports rather than `export *`: the tree-shaking rule in
 * @ragenai/eslint-config/next forbids the star form, and this barrel is
 * imported from route handlers where dragging in the whole client matters.
 */
export { getTemporalClient } from './client';

export {
  TEMPORAL_SERVER_ADDRESS,
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
} from './consts';
