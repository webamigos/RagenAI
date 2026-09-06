import { createOpenAI } from '@ai-sdk/openai';
import { isDeployedEnv } from '@ragenai/env';

import { db } from '../db';
import { logger } from '../logger';
import { decryptApiKey } from '../../utils/decrypt-api-key';

const LITELLM_PROXY_URL =
  process.env.LITELLM_PROXY_URL || 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

/**
 * This check used to spell out its own list of non-deployed environments, and
 * that list was short two entries: it excused `local` and `test` but not `e2e`
 * or `ci`, so a CI run with no master key threw here rather than falling
 * through to the mock proxy the suite provides.
 *
 * `isDeployedEnv()` knows all four. An unset `TARGET_ENV` still counts as
 * deployed for this check — the shared predicate reads it as not deployed,
 * which is right for a laptop and wrong for a worker container that failed to
 * receive its configuration.
 */
const targetEnv = process.env.TARGET_ENV;

if (
  !LITELLM_MASTER_KEY &&
  process.env.NODE_ENV !== 'development' &&
  process.env.NODE_ENV !== 'test' &&
  (targetEnv === undefined || isDeployedEnv(targetEnv))
) {
  throw new Error(
    'LITELLM_MASTER_KEY is required in non-development environments. ' +
      'Set it via environment variables or .env file.',
  );
}

/**
 * Forces `encoding_format='float'` on embedding requests. Scaleway's
 * vLLM-based embedding endpoint rejects requests where this field is null
 * or missing.
 */
const litellmFetch: typeof fetch = async (url, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      body.encoding_format = 'float';
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // not JSON, pass through
    }
  }
  return fetch(url, init);
};

const buildLiteLLMProvider = (apiKey: string) =>
  createOpenAI({
    baseURL: `${LITELLM_PROXY_URL}/v1`,
    apiKey,
    fetch: litellmFetch,
  });

// Master-key provider used as a fallback (and for non-org-scoped operations).
const masterLitellm = buildLiteLLMProvider(
  LITELLM_MASTER_KEY || 'sk-litellm-dev-key',
);

/**
 * Returns a chat model bound to the LiteLLM **master key**.
 *
 * Prefer `getChatModelForOrg(orgId, modelId)` whenever an org context exists,
 * so usage is attributed to the org's virtual key in LiteLLM/Langfuse and the
 * org's spend budget actually applies.
 */
export function getChatModel(modelId: string) {
  return masterLitellm.chat(modelId);
}

/**
 * Returns an embedding model bound to the LiteLLM **master key**.
 *
 * Prefer `getEmbeddingModelForOrg(orgId, modelId)` whenever possible — see
 * `getChatModel` above.
 */
export function getEmbeddingModel(modelId: string) {
  return masterLitellm.textEmbeddingModel(modelId);
}

// Tiny in-process cache so we don't hit Postgres for every embedding batch in
// the same workflow run. apps/web does no caching at all; a short TTL here is
// safe because key rotation is rare and a stale value just costs one retry.
type CachedKey = { value: string | null; expiresAt: number };
const orgKeyCache = new Map<string, CachedKey>();
const ORG_KEY_TTL_MS = 60_000;

const resolveOrgLiteLLMKey = async (orgId: string): Promise<string | null> => {
  const cached = orgKeyCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let resolved: string | null = null;
  try {
    const encrypted = await db.getOrgLiteLLMKeyEncrypted(orgId);
    if (encrypted) {
      resolved = decryptApiKey(encrypted);
    }
  } catch (err) {
    logger.warn(
      { err, orgId },
      'Failed to resolve per-org LiteLLM key, falling back to master key',
    );
  }

  orgKeyCache.set(orgId, {
    value: resolved,
    expiresAt: Date.now() + ORG_KEY_TTL_MS,
  });
  return resolved;
};

/**
 * Returns a LiteLLM provider instance scoped to a specific organization. Falls
 * back to the master key (with a warning log) when the org has no virtual key
 * configured — older orgs created before the LiteLLM team rollout in
 * apps/web may not have one yet.
 */
const getProviderForOrg = async (orgId: string) => {
  const orgKey = await resolveOrgLiteLLMKey(orgId);
  if (orgKey) {
    return buildLiteLLMProvider(orgKey);
  }

  logger.warn(
    { orgId },
    'No per-org LiteLLM key found, falling back to master key — usage will not be attributed to the org',
  );
  return masterLitellm;
};

/**
 * Org-scoped chat model. Uses the per-org LiteLLM virtual key so usage shows
 * up under the right team in LiteLLM/Langfuse and counts against the org's
 * budget.
 */
export async function getChatModelForOrg(orgId: string, modelId: string) {
  const provider = await getProviderForOrg(orgId);
  return provider.chat(modelId);
}

/**
 * Org-scoped embedding model. See `getChatModelForOrg`.
 */
export async function getEmbeddingModelForOrg(orgId: string, modelId: string) {
  const provider = await getProviderForOrg(orgId);
  return provider.textEmbeddingModel(modelId);
}

/**
 * Sends a PDF to a Claude model via LiteLLM's OpenAI-compatible endpoint using
 * Anthropic document content blocks. LiteLLM translates these to the Bedrock
 * Converse API format, keeping data in the configured AWS region (EU).
 *
 * When `orgId` is supplied, the org's per-org LiteLLM virtual key is used so
 * usage is attributed correctly. Otherwise the master key is used.
 */
export async function generateTextWithPdf(params: {
  model: string;
  system: string;
  pdfBase64: string;
  prompt: string;
  orgId?: string;
}): Promise<string> {
  let authKey = LITELLM_MASTER_KEY || 'sk-litellm-dev-key';
  if (params.orgId) {
    const orgKey = await resolveOrgLiteLLMKey(params.orgId);
    if (orgKey) {
      authKey = orgKey;
    } else {
      logger.warn(
        { orgId: params.orgId },
        'No per-org LiteLLM key for PDF call, falling back to master key',
      );
    }
  }

  const LITELLM_PDF_TIMEOUT_MS = 120_000; // 2 minutes for PDF processing

  const response = await fetch(`${LITELLM_PROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authKey}`,
    },
    signal: AbortSignal.timeout(LITELLM_PDF_TIMEOUT_MS),
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: 'system',
          content: params.system,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${params.pdfBase64}`,
              },
            },
            {
              type: 'text',
              text: params.prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `LiteLLM PDF request failed (${response.status}): ${errorBody}`,
    );
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    // `json()` is typed as Promise<unknown> under the monorepo's @types/node,
    // so the shape is asserted here. It is unvalidated external JSON either
    // way — every field below is read optionally.
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error(
      `LiteLLM PDF request returned invalid JSON (${response.status} ${response.statusText})`,
    );
  }
  return data.choices?.[0]?.message?.content ?? '';
}
