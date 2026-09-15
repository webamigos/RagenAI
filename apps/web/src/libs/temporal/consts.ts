export const TEMPORAL_SERVER_ADDRESS =
  process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233';

/**
 * The cancel signal's name.
 *
 * The last thing in this directory that is not the client. It goes when
 * cancellation becomes a database fact (the worker-runtime spec's §4), which
 * is also what removes the need to keep this string identical to the worker's
 * `ACTIVITY_CANCEL_EMBEDDING_COMMAND`.
 */
export const ACTIVITY_CANCEL_EMBEDDING_COMMAND = 'cancelEmbedding';
