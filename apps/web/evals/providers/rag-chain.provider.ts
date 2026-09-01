import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { MockVectorStoreClient } from '../fixtures/mock-vector-store';
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
        vectorStore: new MockVectorStoreClient(),
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

      return {
        output: text,
        tokenUsage: {
          total: usage.totalTokens ?? 0,
          prompt: usage.inputTokens ?? 0,
          completion: usage.outputTokens ?? 0,
        },
      };
    } catch (err) {
      return { error: String(err) };
    }
  }
}

export default RagChainProvider;
