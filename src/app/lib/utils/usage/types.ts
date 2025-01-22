//todo:   tokensEmbeddings?: number;
//todo:   tokensModeration?: number;
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
};
