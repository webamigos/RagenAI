export interface BasicRagChainInput {
  question: string;
  chat_history: string | undefined;
}

export interface VectorStoreDocument {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
}
