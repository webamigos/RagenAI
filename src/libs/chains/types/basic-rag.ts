import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { VectorStore } from '@langchain/core/vectorstores';
import { Embeddings } from '@langchain/core/embeddings';
import { BaseChain } from 'langchain/chains';
import { ThreadDocumentUI } from '../../../app/contracts/ThreadDocument';

export interface BasicRagChainParams {
  vectorStore: VectorStore;
  models: {
    contentModerator: BaseChain;
    questionRephraser: BaseChatModel;
    answerGenerator: BaseChatModel;
    embeddings: Embeddings;
  };
  config?: BasicRagChainConfig;
}

export interface BasicRagChainConfig {
  maxDocumentsToRetrieve?: number;
  answerInstructions?: string | null;
  metadataFilter?: object;
  projectInstruction?: string;
  threadDocuments?: ThreadDocumentUI[];
}
