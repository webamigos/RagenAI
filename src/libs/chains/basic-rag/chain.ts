import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  generateFinalAnswer,
  rephraseQuestion,
  retrieveRelevantDocuments,
  retrieveThreadDocuments,
} from './operations';
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';
import { CHAIN_FINAL_ANSWER_RUN_NAME } from './config';
import type { BasicRagChainParams } from '../types/basic-rag';
import type { BaseChatChainInput, BaseChatChainOutput } from '../types/common';
/**
 * Creates a basic RAG (Retrieval-Augmented Generation) chain.
 *
 * @param {VectorStore} params.vectorStore - The vector store instance used for document retrieval.
 * @param {Object} params.models - LLM models used in the chain.
 * @param {ContentModerator} params.models.contentModerator - Model for content moderation, any BaseChain instance can be used.
 * @param {QuestionRephraser} params.models.questionRephraser - Model for rephrasing questions, any BaseChatModel instance can be used.
 * @param {AnswerGenerator} params.models.answerGenerator - Model for generating final answers, any BaseChatModel instance can be used.
 * @param {BasicRagChainConfig} params.config - Configuration for the chain.
 * @returns {BasicRagChainOutput} An object containing the chain and the final answer run name. Final answer run name can be used to filter events while stream processing.
 */
export const basicRagChain = async ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams): Promise<BaseChatChainOutput> => {
  const chain = RunnableSequence.from<BaseChatChainInput, string>([
    sanitizeAndValidateInput,

    moderateContent(models.contentModerator),

    RunnablePassthrough.assign({
      standalone_question: rephraseQuestion(models.questionRephraser),
    }),

    RunnablePassthrough.assign({
      context: await retrieveRelevantDocuments(
        vectorStore,
        config?.maxDocumentsToRetrieve,
        config?.metadataFilter
      ),
    }),

    RunnablePassthrough.assign({
      thread_context: retrieveThreadDocuments(
        config?.threadDocuments || [],
        vectorStore,
        models.embeddings,
        config?.maxDocumentsToRetrieve || 3
      ),
    }),

    generateFinalAnswer(
      models.answerGenerator,
      CHAIN_FINAL_ANSWER_RUN_NAME,
      config?.answerInstructions,
      config?.projectInstruction
    ),
  ]).withConfig({
    runName: 'Basic RAG chain',
  });

  return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};
