import { defineConfig } from '@ragenai/env';

/**
 * The default configuration, and the template `create-ragen-app` rewrites.
 *
 * ADR-37 declined a `ragen.config.ts` the apps would *read* instead of the
 * environment, and that still holds: a secret does not belong in git, and
 * compose, the Dockerfiles and Railway only speak environment variables.
 * **Nothing reads this file at runtime.** It is the structure and the
 * defaulting, with every value still resolved from `process.env` — which is
 * why a fresh clone works with the minimum `.env.local` AGENTS.md documents,
 * and why the fallbacks below are the same ones the code already applies.
 *
 * What it is for: choosing a provider makes that provider's variables
 * mandatory *in the editor*. `storage: { provider: 's3' }` with no bucket does
 * not compile. `npm run typecheck:config` is what makes that real — without
 * it this file would be checked by nothing, since the repository has no root
 * `tsconfig.json`.
 *
 * The shapes come from `packages/env/src/provider-seams.ts` and
 * `config-groups.ts`, the same tables the boot-time check reads.
 */
export default defineConfig({
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:pass123@localhost:55432/smartrag',
  },

  gateway: {
    // Every model call goes through LiteLLM (ADR-04).
    url: process.env.LITELLM_PROXY_URL ?? 'http://localhost:4000',
    masterKey: process.env.LITELLM_MASTER_KEY,
  },

  vectorStore: {
    // Qdrant is the only supported vector store (ADR-31).
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  },

  models: {
    chat: process.env.DEFAULT_MODEL ?? 'gemini-3-flash-preview',
    // Do not upgrade without approval — see AGENTS.md, "Model Defaults".
    rephrase: process.env.REPHRASE_MODEL ?? 'gemini-2.5-flash',
    summary: process.env.SUMMARY_MODEL ?? 'gemini-2.5-flash',
    embeddings: process.env.EMBEDDINGS_MODEL,
    // Changing this after documents exist invalidates the collection.
    vectorSize: process.env.VECTOR_SIZE,
  },

  storage: {
    // ADR-27: local by default, so a fresh clone runs without a cloud account.
    provider: 'local',
    path: process.env.STORAGE_LOCAL_PATH,
  },
});
