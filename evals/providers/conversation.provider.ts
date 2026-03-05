import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { conversationChain } from '@/libs/chains/conversation-chain/chain';
import { createNoopModeration, resolveApiKey } from './shared';
import type { ProviderCredentials } from '@/libs/llm/types';

export interface ConversationProviderConfig {
  provider?: ProviderCredentials['provider'];
  model?: string;
  answerInstructions?: string;
  projectInstruction?: string;
}

export class ConversationProvider implements ApiProvider {
  private providerConfig: ConversationProviderConfig;

  constructor(config?: ConversationProviderConfig) {
    this.providerConfig = config ?? {};
  }

  id(): string {
    return `conversation:${this.providerConfig.provider ?? 'openrouter'}:${this.providerConfig.model ?? 'openai/gpt-4o'}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
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

    try {
      const chain = await conversationChain({
        models: {
          contentModerator: createNoopModeration(),
          answerGenerator,
        },
        config: {
          answerInstructions: this.providerConfig.answerInstructions,
          projectInstruction: this.providerConfig.projectInstruction,
        },
      });

      const chatHistory = context?.vars?.chat_history;
      const chatHistoryStr =
        typeof chatHistory === 'string' ? chatHistory : undefined;

      const result = await chain.stream({
        question: prompt,
        chat_history: chatHistoryStr,
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

export default ConversationProvider;
