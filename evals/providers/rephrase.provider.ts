import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from 'promptfoo';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';
import { rephraseAndExpand } from '@/libs/chains/basic-rag/operations';
import { getLiteLLMCredentials, DEFAULT_EVAL_MODEL } from './shared';

export interface RephraseProviderConfig {
  model?: string;
}

export class RephraseProvider implements ApiProvider {
  private providerConfig: RephraseProviderConfig;

  /**
   * promptfoo passes the whole ProviderOptions object (`{ id, label, config }`),
   * not the bare config — reading it off the top level discarded every
   * configured value. See rag-chain.provider.ts for the same fix.
   */
  constructor(options?: { id?: string; config?: RephraseProviderConfig }) {
    this.providerConfig = options?.config ?? {};
  }

  id(): string {
    return `rephrase:litellm:${this.providerConfig.model ?? DEFAULT_EVAL_MODEL}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const model = this.providerConfig.model ?? DEFAULT_EVAL_MODEL;

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

      // The basic-RAG chain calls rephraseAndExpand(), not rephraseQuestion() —
      // the two were merged into one LLM call. This suite previously exercised
      // rephraseQuestion(), which no production path reaches, so it graded code
      // that could drift freely from what actually ships.
      const { standaloneQuestion } = await rephraseAndExpand(
        questionRephraser,
        {
          question: prompt,
          chat_history: chatHistoryStr,
        },
      );

      return { output: standaloneQuestion };
    } catch (err) {
      return { error: String(err) };
    }
  }
}

export default RephraseProvider;
