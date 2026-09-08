import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { MockVectorStoreClient } from '../fixtures/mock-vector-store';
import demoCorpus from '../fixtures/documents/demo-corpus.json' with { type: 'json' };
import { selectCitedSources } from '@/features/documents/utils/cited-sources';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import {
  createNoopModeration,
  createNoopEmbeddings,
  getLiteLLMCredentials,
  DEFAULT_EVAL_MODEL,
} from './shared';

export interface RagChainProviderConfig {
  model?: string;
  answerInstructions?: string;
  projectInstruction?: string;
  /**
   * Which fixture the mock store serves. `product-faq` (default) is the eight
   * bare-metadata FAQ chunks the answer-quality suites were written against;
   * `demo-corpus` is the demo tenant's three documents, chunked per section and
   * carrying `file_name`, so `<chunk file="…">` renders as in production and
   * the model has something to cite by. The citations suite needs the latter.
   */
  corpus?: 'product-faq' | 'demo-corpus';
}

export class RagChainProvider implements ApiProvider {
  private providerConfig: RagChainProviderConfig;

  /**
   * promptfoo constructs `file://` providers with the whole ProviderOptions
   * object (`{ id, label, config }`), not with the bare `config`. Reading
   * `config` off the top level silently discarded every configured value, so
   * the model always fell through to the hardcoded default no matter what the
   * YAML said.
   */
  constructor(options?: { id?: string; config?: RagChainProviderConfig }) {
    this.providerConfig = options?.config ?? {};
  }

  id(): string {
    return `rag-chain:litellm:${this.providerConfig.model ?? DEFAULT_EVAL_MODEL}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const model = this.providerConfig.model ?? DEFAULT_EVAL_MODEL;
    const credentials = getLiteLLMCredentials();

    const answerGenerator = ChatCompletionFactory.createInstance(credentials, {
      model,
    });
    const questionRephraser = ChatCompletionFactory.createInstance(
      credentials,
      { model },
    );

    try {
      const chain = await basicRagChain({
        vectorStore:
          this.providerConfig.corpus === 'demo-corpus'
            ? new MockVectorStoreClient(demoCorpus as VectorStoreDocument[])
            : new MockVectorStoreClient(),
        models: {
          contentModerator: createNoopModeration(),
          answerGenerator,
          questionRephraser,
          embeddings: createNoopEmbeddings(),
        },
        config: {
          answerInstructions: this.providerConfig.answerInstructions,
          projectInstruction: this.providerConfig.projectInstruction,
          threadDocuments: [],
        },
      });

      const result = await chain.stream({
        question: prompt,
        chat_history: undefined,
      });

      const text = await result.text;
      const usage = (await result.usage) ?? {};
      // The same intersection `assistant-stream.ts` persists as
      // `DocumentCitation` rows, surfaced so a result row shows what the
      // model was shown against what it named. Assertions read the output;
      // this is for the person reading `evals/results/*.json` afterwards.
      const retrieved = await result.retrievedSources;
      const cited = selectCitedSources(retrieved, text);

      return {
        output: text,
        tokenUsage: {
          total: usage.totalTokens ?? 0,
          prompt: usage.inputTokens ?? 0,
          completion: usage.outputTokens ?? 0,
        },
        metadata: {
          retrievedFiles: retrieved.map((s) => s.fileName ?? s.fileId),
          citedFiles: cited.map((s) => s.fileName ?? s.fileId),
        },
      };
    } catch (err) {
      return { error: String(err) };
    }
  }
}

export default RagChainProvider;
