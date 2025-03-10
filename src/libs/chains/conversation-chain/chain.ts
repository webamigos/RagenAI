import { RunnableSequence } from '@langchain/core/runnables';
import { generateFinalAnswer } from './operations';
import { CHAIN_FINAL_ANSWER_RUN_NAME } from './config';
import type { ConversationChainParams } from '../types/conversation';
import type { BaseChatChainInput, BaseChatChainOutput } from '../types/common';
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';

/**
 * Creates a conversation chain, wrapper to the LLM api.
 *
 * @param {Object} params.models - LLM models used in the chain.
 * @param {ContentModerator} params.models.contentModerator - Model for content moderation, any BaseChain instance can be used.
 * @param {AnswerGenerator} params.models.answerGenerator - Model for generating final answers, any BaseChatModel instance can be used.
 * @param {BasicRagChainConfig} params.config - Configuration for the chain.
 * @returns {BasicRagChainOutput} An object containing the chain and the final answer run name. Final answer run name can be used to filter events while stream processing.
 */
export const conversationChain = async ({
  models,
  config,
}: ConversationChainParams): Promise<BaseChatChainOutput> => {
  // Create a chain that follows the same pattern as basicRagChain
  const chain = RunnableSequence.from<BaseChatChainInput, string>([
    // Step 1: Sanitize and validate the input
    sanitizeAndValidateInput(),

    // Step 2: Moderate the content
    moderateContent(models.contentModerator, false),

    // Step 3: Generate the final answer
    generateFinalAnswer(
      models.answerGenerator,
      CHAIN_FINAL_ANSWER_RUN_NAME,
      config?.answerInstructions,
      config?.projectInstruction
    ),
  ]).withConfig({
    runName: 'Conversation chain',
  });

  return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};
