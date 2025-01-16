import { RunnableSequence } from '@langchain/core/runnables';
import { generateFinalAnswer } from './operations';

import type {
  BasicRagChainInput,
  BasicRagChainParams,
  BasicRagChainOutput,
} from '../types/basic-rag';
import { logger } from '@/app/lib/utils/logger';

const CHAIN_FINAL_ANSWER_RUN_NAME = 'final_answer'; //TODO: export to common config

/**
 * Creates an agentic RAG instance.
 *
 * @param {VectorStore} params.vectorStore - The vector store instance used for document retrieval.
 * @param {Object} params.models - LLM models used in the chain.
 * @param {ContentModerator} params.models.contentModerator - Model for content moderation, any BaseChain instance can be used.
 * @param {QuestionRephraser} params.models.questionRephraser - Model for rephrasing questions, any BaseChatModel instance can be used.
 * @param {AnswerGenerator} params.models.answerGenerator - Model for generating final answers, any BaseChatModel instance can be used.
 * @param {BasicRagChainConfig} params.config - Configuration for the chain.
 * @returns {BasicRagChainOutput} An object containing the chain and the final answer run name. Final answer run name can be used to filter events while stream processing.
 */
export const agenticRagChain = ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams): BasicRagChainOutput => {
  const chain = RunnableSequence.from<BasicRagChainInput, string>([
    ({ question }) => {
      return { question };
    },
    generateFinalAnswer(models.answerGenerator, CHAIN_FINAL_ANSWER_RUN_NAME),
  ]).withConfig({
    runName: 'Agentic RAG chain',
  });

  return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};
