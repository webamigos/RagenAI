import { generateText } from 'ai';

import { nativeChatModel, nativeEmbeddingModel } from './native-models.js';

/**
 * Returns a chat model bound to the LiteLLM **master key**.
 *
 * Prefer `getChatModelForOrg(orgId, modelId)` whenever an org context exists,
 * so usage is attributed to the org's virtual key in LiteLLM/Langfuse and the
 * org's spend budget actually applies.
 */
export async function getChatModel(modelId: string) {
  return nativeChatModel(modelId);
}

/**
 * Returns an embedding model bound to the LiteLLM **master key**.
 *
 * Prefer `getEmbeddingModelForOrg(orgId, modelId)` whenever possible — see
 * `getChatModel` above.
 */
export async function getEmbeddingModel(modelId: string) {
  return nativeEmbeddingModel(modelId);
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
  return nativeChatModel(modelId, orgId);
}

/**
 * Org-scoped embedding model. See `getChatModelForOrg`.
 */
export async function getEmbeddingModelForOrg(orgId: string, modelId: string) {
  return nativeEmbeddingModel(modelId, orgId);
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
 * Sends a PDF to a Claude model as Anthropic document content blocks.
 *
 * Kept as the name every caller already uses; the work is
 * `generateTextWithPdfNatively`. What it used to wrap was a hand-built
 * `/v1/chat/completions` post to the proxy with a base64 data URL, which the
 * proxy translated to Bedrock's Converse API — that went with the proxy, and
 * the AI SDK's Bedrock provider does the translation now.
 */
export async function generateTextWithPdf(params: {
  model: string;
  system: string;
  pdfBase64: string;
  prompt: string;
  orgId?: string;
}): Promise<string> {
  return generateTextWithPdfNatively(params);
}
