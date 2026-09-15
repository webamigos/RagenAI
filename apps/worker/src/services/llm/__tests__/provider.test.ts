import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the worker's model getters do.
 *
 * This file used to be `provider-gateway-seam.test.ts` and was organised
 * around `LLM_GATEWAY=native`, the flag that chose between the LiteLLM proxy
 * and calling providers directly. B6 deleted the flag and the proxy, so a test
 * shaped around the choice was asserting a branch selection that can no longer
 * happen — and would have kept passing if the remaining path broke. What is
 * left is the behaviour itself.
 *
 * `generateTextWithPdf` gets the most attention because it is the one call in
 * the monorepo that depended on the proxy **rewriting** a request rather than
 * forwarding it: the PDF rode as an `image_url` holding a
 * `data:application/pdf;base64,…`, which is not OpenAI's shape and only worked
 * because LiteLLM recognised it and emitted a Bedrock Converse document block.
 * Nothing about that translation is visible from this side, so the path that
 * replaced it has to be asserted on the messages it builds.
 */

const generateText = vi.hoisted(() =>
  vi.fn(async (_options: unknown) => ({ text: 'pdf text' })),
);
const resolveModel = vi.hoisted(() => vi.fn(async () => ({ id: 'chat' })));
const resolveEmbeddingModel = vi.hoisted(() =>
  vi.fn(async () => ({ id: 'embedding' })),
);

vi.mock('ai', () => ({ generateText }));

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return {
    ...actual,
    gatewayFromEnv: () => ({ resolveModel, resolveEmbeddingModel }),
  };
});

const saved = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

const load = () => import('../provider.js');

describe('the model getters', () => {
  it('resolves a chat model through the gateway', async () => {
    const { getChatModel } = await load();

    await getChatModel('gemini-2.5-flash');

    expect(resolveModel).toHaveBeenCalledWith('gemini-2.5-flash', {
      scope: undefined,
    });
  });

  it('resolves an embedding model through the gateway', async () => {
    const { getEmbeddingModel } = await load();

    await getEmbeddingModel('qwen3-embedding-8b');

    expect(resolveEmbeddingModel).toHaveBeenCalledWith('qwen3-embedding-8b', {
      scope: undefined,
    });
  });

  /**
   * The org is a **credential scope**, and this is the only place the worker
   * expresses it. The environment credential source ignores the scope today;
   * per-org keys in ragen-token-vault will not (ADR-13/ADR-32), and a getter
   * that quietly dropped it would then serve one org's job on another org's
   * key — with nothing else in this app to catch it, because every other layer
   * takes the model it is handed.
   */
  it('passes the org through as a credential scope', async () => {
    const { getChatModelForOrg } = await load();

    await getChatModelForOrg('org_1', 'gemini-2.5-flash');

    expect(resolveModel).toHaveBeenCalledWith('gemini-2.5-flash', {
      scope: { organizationId: 'org_1' },
    });
  });

  it('passes the org through for embeddings too', async () => {
    const { getEmbeddingModelForOrg } = await load();

    await getEmbeddingModelForOrg('org_1', 'qwen3-embedding-8b');

    expect(resolveEmbeddingModel).toHaveBeenCalledWith('qwen3-embedding-8b', {
      scope: { organizationId: 'org_1' },
    });
  });

  /**
   * Chat and embedding models resolve through different gateway calls and are
   * not interchangeable — an embedding model handed to `generateText` fails at
   * the provider, far from here.
   */
  it('does not confuse the two resolvers', async () => {
    const { getChatModelForOrg, getEmbeddingModelForOrg } = await load();

    await getChatModelForOrg('org_1', 'gemini-2.5-flash');
    expect(resolveEmbeddingModel).not.toHaveBeenCalled();

    await getEmbeddingModelForOrg('org_1', 'qwen3-embedding-8b');
    expect(resolveModel).toHaveBeenCalledTimes(1);
  });
});

describe('generateTextWithPdf', () => {
  const callPdf = async () => {
    const { generateTextWithPdf } = await load();
    return generateTextWithPdf({
      model: 'claude-sonnet-5',
      system: 'sys',
      pdfBase64: 'JVBER',
      prompt: 'extract',
      orgId: 'org_1',
    });
  };

  it('goes through generateText rather than a hand-built request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await callPdf()).toBe('pdf text');
    expect(generateText).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * The whole point of the port: a real `file` part with a media type, which
   * the Bedrock provider turns into the Converse document block LiteLLM used
   * to synthesise — rather than a PDF smuggled inside an image URL.
   */
  it('carries the PDF as a file part, not an image URL', async () => {
    await callPdf();

    const call = generateText.mock.calls[0]![0] as {
      messages: { content: { type: string; mediaType?: string }[] }[];
    };
    const parts = call.messages[0]!.content;

    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'file',
        mediaType: 'application/pdf',
        data: 'JVBER',
      }),
    );
    expect(parts.some((part) => part.type === 'image_url')).toBe(false);
  });

  it('keeps the system prompt and the text prompt distinct', async () => {
    await callPdf();

    const call = generateText.mock.calls[0]![0] as {
      system: string;
      messages: { content: { type: string; text?: string }[] }[];
    };

    expect(call.system).toBe('sys');
    expect(call.messages[0]!.content).toContainEqual({
      type: 'text',
      text: 'extract',
    });
  });

  it('resolves the model scoped to the org', async () => {
    await callPdf();

    expect(resolveModel).toHaveBeenCalledWith('claude-sonnet-5', {
      scope: { organizationId: 'org_1' },
    });
  });

  /** The 2-minute budget was a property of the work, not of the proxy. */
  it('keeps the PDF timeout', async () => {
    await callPdf();

    const call = generateText.mock.calls[0]![0] as {
      abortSignal?: AbortSignal;
    };
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
