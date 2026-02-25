import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModerationInstance } from '@/app/lib/services/llm';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';

export interface BaseChatChainInput {
  question: string;
  chat_history: string | undefined;
}

export interface BaseChatChainModels {
  contentModerator: ModerationInstance;
  answerGenerator: LanguageModelV3;
}

export interface RagChainModels extends BaseChatChainModels {
  questionRephraser: LanguageModelV3;
  embeddings: EmbeddingsProvider;
}

export interface ChainConfig {
  answerInstructions?: string | null;
  projectInstruction?: string;
}

export interface RagChainConfig extends ChainConfig {
  maxDocumentsToRetrieve?: number;
  metadataFilter?: object;
  threadDocuments?: import('@/features/documents/contracts/document.types').ThreadDocumentUI[];
}

export interface ChainStreamResult {
  textStream: AsyncIterable<string>;
  text: PromiseLike<string>;
}

export interface BaseChatChainOutput {
  stream: (input: BaseChatChainInput) => Promise<ChainStreamResult>;
}
