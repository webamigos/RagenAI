import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { conversationChain } from '@/libs/chains/conversation-chain/chain';
import { createNoopModeration, getLiteLLMCredentials } from './shared';

export interface ConversationProviderConfig {
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
    return `conversation:litellm:${this.providerConfig.model ?? 'gpt-4o'}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const model = this.providerConfig.model ?? 'gpt-4o';

    const answerGenerator = ChatCompletionFactory.createInstance(
      getLiteLLMCredentials(),
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
