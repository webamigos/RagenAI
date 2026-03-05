import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { MockVectorStoreClient } from '../fixtures/mock-vector-store';
import {
  createNoopModeration,
  createNoopEmbeddings,
  resolveApiKey,
} from './shared';
import type { ProviderCredentials } from '@/libs/llm/types';

export interface RagChainProviderConfig {
  provider?: ProviderCredentials['provider'];
  model?: string;
  answerInstructions?: string;
  projectInstruction?: string;
}

export class RagChainProvider implements ApiProvider {
  private providerConfig: RagChainProviderConfig;

  constructor(config?: RagChainProviderConfig) {
    this.providerConfig = config ?? {};
  }

  id(): string {
    return `rag-chain:${this.providerConfig.provider ?? 'openrouter'}:${this.providerConfig.model ?? 'openai/gpt-4o'}`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const provider = this.providerConfig.provider ?? 'openrouter';
    const model = this.providerConfig.model ?? 'openai/gpt-4o';

    const apiKey = resolveApiKey(provider);

    if (!apiKey) {
      return { error: `Missing API key for provider ${provider}` };
    }

    const answerGenerator = ChatCompletionFactory.createInstance(
      { provider, apiKey } as ProviderCredentials,
      { model },
    );
    const questionRephraser = ChatCompletionFactory.createInstance(
      { provider, apiKey } as ProviderCredentials,
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
