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

export interface VercelAIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
