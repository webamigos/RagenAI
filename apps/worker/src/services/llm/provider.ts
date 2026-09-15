import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

import { isMasterKeyRequired } from './require-master-key.js';
import {
  nativeChatModel,
  nativeEmbeddingModel,
  usingNativeGateway,
} from './native-models.js';

const LITELLM_PROXY_URL =
  process.env.LITELLM_PROXY_URL || 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

// The rule itself lives in `./require-master-key`, where it can be tested
// without importing this module — which throws as it loads and drags knex,
// the logger and the AI SDK in with it.
if (isMasterKeyRequired(process.env)) {
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
export async function getChatModel(modelId: string) {
  if (usingNativeGateway()) {
    return nativeChatModel(modelId);
  }
  return masterLitellm.chat(modelId);
}

/**
 * Returns an embedding model bound to the LiteLLM **master key**.
 *
 * Prefer `getEmbeddingModelForOrg(orgId, modelId)` whenever possible — see
 * `getChatModel` above.
 */
export async function getEmbeddingModel(modelId: string) {
  if (usingNativeGateway()) {
    return nativeEmbeddingModel(modelId);
  }
  return masterLitellm.textEmbeddingModel(modelId);
}

/**
 * Org-scoped chat model.
 *
 * `orgId` no longer picks a per-org LiteLLM virtual key — those carried the
 * proxy's own budget, which the application enforces itself since Phase A, and
 * B5 removed them. On the proxy path this is now the master key; on the gateway
 * path the org becomes a credential scope, which is where per-org keys will
 * return if they return (ragen-token-vault, ADR-13/ADR-32).
 */
export async function getChatModelForOrg(orgId: string, modelId: string) {
  if (usingNativeGateway()) {
    return nativeChatModel(modelId, orgId);
  }
  return masterLitellm.chat(modelId);
}

/**
 * Org-scoped embedding model. See `getChatModelForOrg`.
 */
export async function getEmbeddingModelForOrg(orgId: string, modelId: string) {
  if (usingNativeGateway()) {
    return nativeEmbeddingModel(modelId, orgId);
  }
  return masterLitellm.textEmbeddingModel(modelId);
}

const PDF_TIMEOUT_MS = 120_000; // 2 minutes for PDF processing

/**
 * The gateway path for a PDF.
 *
 * The proxy path below hand-rolls an OpenAI-compatible request carrying the PDF
 * as an `image_url` whose URL is a `data:application/pdf;base64,…` — a shape
 * that is not OpenAI's and only works because LiteLLM recognises it and
 * translates it into a Bedrock Converse document block. It is the one call in
 * this app that depends on the proxy *rewriting* a request rather than
 * forwarding it, which is why it could not be ported by swapping a base URL.
 *
 * The AI SDK has the concept first-class: a `file` content part with a media
 * type. `@ai-sdk/amazon-bedrock` turns that into the same Converse document
 * block LiteLLM was producing, so the bytes still never leave the configured
 * AWS region.
 */
async function generateTextWithPdfNatively(params: {
  model: string;
  system: string;
  pdfBase64: string;
  prompt: string;
  orgId?: string;
}): Promise<string> {
  const model = await nativeChatModel(params.model, params.orgId);

  const { text } = await generateText({
    model,
    system: params.system,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: params.pdfBase64,
          },
          { type: 'text', text: params.prompt },
        ],
      },
    ],
    abortSignal: AbortSignal.timeout(PDF_TIMEOUT_MS),
  });

  return text;
}

/**
 * Sends a PDF to a Claude model via LiteLLM's OpenAI-compatible endpoint using
 * Anthropic document content blocks. LiteLLM translates these to the Bedrock
 * Converse API format, keeping data in the configured AWS region (EU).
 *
 * When `orgId` is supplied, the org's per-org LiteLLM virtual key is used so
 * usage is attributed correctly. Otherwise the master key is used.
 *
 * Under `LLM_GATEWAY=native` this whole shape is bypassed — see
 * `generateTextWithPdfNatively`.
 */
export async function generateTextWithPdf(params: {
  model: string;
  system: string;
  pdfBase64: string;
  prompt: string;
  orgId?: string;
}): Promise<string> {
  if (usingNativeGateway()) {
    return generateTextWithPdfNatively(params);
  }

  const authKey = LITELLM_MASTER_KEY || 'sk-litellm-dev-key';

  const response = await fetch(`${LITELLM_PROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authKey}`,
    },
    signal: AbortSignal.timeout(PDF_TIMEOUT_MS),
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
