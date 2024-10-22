import { EmbeddingsInterface } from '@langchain/core/embeddings';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  ChatOpenAI,
  ChatOpenAICallOptions,
  ChatOpenAIFields,
} from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { BasicRagChainInput } from '../types/chain';
import { CHAIN_FINAL_ANSWER_RUN_NAME, modelParams } from './config';
import {
  generateFinalAnswer,
  moderateContent,
  rephraseQuestion,
  retrieveRelevantDocuments,
  sanitizeAndValidateInput,
} from './operations';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';

type BasicRagChainParams = {
  orgId: string;
  vectorStore: SupabaseVectorStore;
  models: {
    embeddingModel: EmbeddingsInterface;
    createModerationInstance: (orgId: string) => Promise<OpenAIModerationChain>;
    createChatInstance: (
      orgId: string,
      options: Omit<ChatOpenAIFields, 'apiKey'>
    ) => Promise<ChatOpenAI<ChatOpenAICallOptions>>;
  };
};

export const basicRagChain = async ({
  orgId,
  vectorStore,
  models,
}: BasicRagChainParams) => {
  const contentModerator = await models.createModerationInstance(orgId);
  const questionRephraser = await models.createChatInstance(
    orgId,
    modelParams.standaloneQuestion
  );
  const answerGenerator = await models.createChatInstance(
    orgId,
    modelParams.answer
  );

  const chain = RunnableSequence.from<BasicRagChainInput, string>([
    sanitizeAndValidateInput,

    moderateContent(contentModerator),

    RunnablePassthrough.assign({
      standalone_question: rephraseQuestion(questionRephraser),
    }),

    RunnablePassthrough.assign({
      context: retrieveRelevantDocuments(vectorStore),
    }),

    generateFinalAnswer(answerGenerator, CHAIN_FINAL_ANSWER_RUN_NAME),
  ]).withConfig({
    runName: 'Question answering chain',
  });

  return { chain, finalAnswerRunName: CHAIN_FINAL_ANSWER_RUN_NAME };
};
