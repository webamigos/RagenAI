import { UsageMetadata, BaseMessage } from '@langchain/core/messages';
import { ChatGeneration } from '@langchain/core/outputs';

export type UsageMetrics = {
  chatCompletionInputTokens?: number;
  chatCompletionOutputTokens?: number;
  chatCompletionTotalTokens?: number;
  createdThreads?: number;
  messagesTotal?: number;
  messagesUser?: number;
  messagesAssistant?: number;
  apiCalls?: number;
  filesUploaded?: number;
  filesUploadedSize?: number;
  embeddingsPromptTokens?: number;
  embeddingsTotalTokens?: number;
};

export interface ChatGenerationWithMetadata extends ChatGeneration {
  message: BaseMessage & { usage_metadata?: UsageMetadata };
}
