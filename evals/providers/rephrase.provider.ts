import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { rephraseQuestion } from '@/libs/chains/basic-rag/operations';
import { getLiteLLMCredentials } from './shared';

export interface RephraseProviderConfig {
  model?: string;
}

export class RephraseProvider implements ApiProvider {
  private providerConfig: RephraseProviderConfig;

  constructor(config?: RephraseProviderConfig) {
    this.providerConfig = config ?? {};
  }

  id(): string {
    return `rephrase:litellm:${this.providerConfig.model ?? 'gpt-4o'}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const model = this.providerConfig.model ?? 'gpt-4o';

    const questionRephraser = ChatCompletionFactory.createInstance(
      getLiteLLMCredentials(),
      { model },
    );

    try {
      const chatHistory = context?.vars?.chat_history;
      let chatHistoryStr: string | undefined;
      if (typeof chatHistory === 'string') {
        chatHistoryStr = chatHistory;
      } else if (Array.isArray(chatHistory)) {
        chatHistoryStr = (chatHistory as { role: string; content: string }[])
          .map(
            (m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`,
          )
          .join('\n');
      }

      const result = await rephraseQuestion(questionRephraser, {
        question: prompt,
        chat_history: chatHistoryStr,
      });

      return { output: result };
    } catch (err) {
      return { error: String(err) };
    }
  }
}

export default RephraseProvider;
