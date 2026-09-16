/**
 * `server-only`, for a process that is nothing but server.
 *
 * The real package throws on import — it is a build-time tripwire that fails a
 * module which reached a client bundle. The evals are a plain Node process
 * driving the same chain the route handlers drive, so the guard fires on code
 * it was never meant to catch, and takes the whole harness down before the
 * first question is asked:
 *
 *   ESM import failed: This module cannot be imported from a Client Component
 *
 * It arrived transitively and invisibly. `basic-rag/chain` → `operations` →
 * `create-ai-usage-command` → `check-team-rate-limit-query`, whose first line
 * is `import 'server-only'` — added in #1175, which had no reason to think
 * about promptfoo. Every suite that loads the chain (citations, rag-quality,
 * red-team, model-comparison) has been failing at provider construction since,
 * and nothing said so, because none of them runs in CI.
 *
 * Shimmed rather than worked around in the source: moving the import would be
 * changing production code to suit a test runner, and `server-only` on a query
 * that reads a rate limit is correct.
 */
export {};
