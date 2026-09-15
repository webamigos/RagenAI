import { generateText } from 'ai';

import { nativeChatModel, nativeEmbeddingModel } from './native-models.js';

/**
 * A chat model, with no org attached.
 *
 * Prefer `getChatModelForOrg(orgId, modelId)` wherever an org context exists.
 * The org is a credential scope: the environment credential source ignores it
 * today, but per-org keys in ragen-token-vault will not (ADR-13/ADR-32), and a
 * call that resolved without one would then reach for the deployment-wide key.
 */
export async function getChatModel(modelId: string) {
  return nativeChatModel(modelId);
}

/**
 * An embedding model, with no org attached. See `getChatModel`.
 */
export async function getEmbeddingModel(modelId: string) {
  return nativeEmbeddingModel(modelId);
}

/**
 * Org-scoped chat model.
 *
 * `orgId` is a credential scope, not a key selector. It used to pick a per-org
 * LiteLLM virtual key carrying the proxy's own spend budget; the application
 * has enforced those budgets itself since Phase A, B5 removed the keys, and B6
 * removed the proxy. Per-org credentials return here if they return at all
 * (ragen-token-vault, ADR-13/ADR-32) — which is why the scope is threaded now
 * rather than added later.
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
 * Sends a PDF to a Claude model as document content blocks.
 *
 * This was the one call in the app that depended on the proxy **rewriting** a
 * request rather than forwarding it, which is why it could not be ported by
 * swapping a base URL. It used to hand-build an OpenAI-compatible request
 * carrying the PDF as an `image_url` whose URL was a
 * `data:application/pdf;base64,…` — a shape that is not OpenAI's at all, and
 * worked only because LiteLLM recognised it and translated it into a Bedrock
 * Converse document block.
 *
 * The AI SDK has the concept first-class: a `file` content part with a media
 * type. `@ai-sdk/amazon-bedrock` turns that into the same Converse document
 * block LiteLLM was producing, so the bytes still never leave the configured
 * AWS region. Worth keeping written down, because the request this builds is
 * the only evidence of that translation from this side.
 */
export async function generateTextWithPdf(params: {
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
