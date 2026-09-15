import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The worker's half of the `LLM_GATEWAY` seam.
 *
 * `generateTextWithPdf` gets the most attention here because it is the one
 * call in the monorepo that depended on the proxy **rewriting** a request
 * rather than forwarding it: the PDF rode as an `image_url` holding a
 * `data:application/pdf;base64,…`, which is not OpenAI's shape and only worked
 * because LiteLLM recognised it and emitted a Bedrock Converse document block.
 * Nothing about that translation is visible from this side, so the native path
 * has to be asserted on the messages it builds.
 */

const generateText = vi.hoisted(() =>
  vi.fn(async (_options: unknown) => ({ text: 'native pdf text' })),
);
const resolveModel = vi.hoisted(() => vi.fn(async () => ({ id: 'native' })));
const resolveEmbeddingModel = vi.hoisted(() =>
  vi.fn(async () => ({ id: 'native-embedding' })),
);
const chat = vi.hoisted(() => vi.fn(() => ({ id: 'proxy-chat' })));
const textEmbeddingModel = vi.hoisted(() =>
  vi.fn(() => ({ id: 'proxy-embeddings' })),
);
const getOrgLiteLLMKeyEncrypted = vi.hoisted(() => vi.fn(async () => null));

vi.mock('ai', () => ({ generateText }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ chat, textEmbeddingModel }),
}));

vi.mock('@ragenai/llm-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ragenai/llm-gateway')>();
  return {
    ...actual,
    gatewayFromEnv: () => ({ resolveModel, resolveEmbeddingModel }),
  };
});

vi.mock('../../db/index.js', () => ({
  db: { getOrgLiteLLMKeyEncrypted },
}));

vi.mock('../../logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../utils/decrypt-api-key.js', () => ({
  decryptApiKey: (value: string) => value,
}));

const saved = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
  process.env.LITELLM_MASTER_KEY = 'sk-master';
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

const load = () => import('../provider.js');

describe('LLM_GATEWAY=litellm (the default)', () => {
  beforeEach(() => {
    delete process.env.LLM_GATEWAY;
  });

  it('builds a chat model through the proxy provider', async () => {
    const { getChatModelForOrg } = await load();

    await getChatModelForOrg('org_1', 'gemini-2.5-flash');

    expect(chat).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it('builds an embedding model through the proxy provider', async () => {
    const { getEmbeddingModelForOrg } = await load();

    await getEmbeddingModelForOrg('org_1', 'qwen3-embedding-8b');

    expect(textEmbeddingModel).toHaveBeenCalledWith('qwen3-embedding-8b');
    expect(resolveEmbeddingModel).not.toHaveBeenCalled();
  });

  it('posts the PDF to the proxy by hand', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'proxy text' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { generateTextWithPdf } = await load();
    const text = await generateTextWithPdf({
      model: 'claude-sonnet-5',
      system: 'sys',
      pdfBase64: 'JVBER',
      prompt: 'extract',
    });

    expect(text).toBe('proxy text');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe('LLM_GATEWAY=native', () => {
  beforeEach(() => {
    process.env.LLM_GATEWAY = 'native';
  });

  it('builds a chat model through the gateway, scoped to the org', async () => {
    const { getChatModelForOrg } = await load();

    await getChatModelForOrg('org_1', 'gemini-2.5-flash');

    expect(resolveModel).toHaveBeenCalledWith('gemini-2.5-flash', {
      scope: { organizationId: 'org_1' },
    });
    expect(chat).not.toHaveBeenCalled();
  });

  it('builds an embedding model through the gateway, scoped to the org', async () => {
    const { getEmbeddingModelForOrg } = await load();

    await getEmbeddingModelForOrg('org_1', 'qwen3-embedding-8b');

    expect(resolveEmbeddingModel).toHaveBeenCalledWith('qwen3-embedding-8b', {
      scope: { organizationId: 'org_1' },
    });
    expect(textEmbeddingModel).not.toHaveBeenCalled();
  });

  /**
   * The org's virtual key carries LiteLLM's per-team budget, which Phase A
   * moved into the database. Reading it here would be a pointless query, and a
   * failing one once B5 drops the column.
   */
  it('does not read the org virtual key', async () => {
    const { getChatModelForOrg } = await load();

    await getChatModelForOrg('org_1', 'gemini-2.5-flash');

    expect(getOrgLiteLLMKeyEncrypted).not.toHaveBeenCalled();
  });

  describe('the PDF path', () => {
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

      expect(await callPdf()).toBe('native pdf text');
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
});
