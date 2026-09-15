/**
 * The task queue this worker listens on, and the scripts register schedules
 * against.
 *
 * What is gone from here: `ACTIVITY_CANCEL_EMBEDDING_COMMAND` and
 * `ACTIVITY_EMBEDDING_STATE_QUERY`, the signal and query names — cancellation
 * is a row now (the spec's §4), so neither exists to be named. The three
 * `*EmbeddingProcessInput` types went with them; nothing had imported one.
 *
 * The queue name is also `TASK_QUEUE_NAME` in `@ragenai/jobs-temporal`, which
 * is the producer side of the same string. They are deliberately not shared:
 * the adapter is the package that leaves in Phase G, and the worker has to
 * keep listening on this queue whichever runtime it was built with.
 */
export const TASK_QUEUE_NAME = 'ragen-tasks';
