import { DOCUMENT_SEARCH_QUERY_NAME } from '@/app/constants/vectorStore';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  Runnable,
  RunnableLambda,
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  CHAIN_FINAL_ANSWER_RUN_NAME,
  HISTORY_CHARACTER_LIMIT,
  MAX_USER_INPUT_LENGTH,
  modelParams,
} from '../constants/chainConfig';
import { ThreadConversationPrompts } from '../constants/prompts';
import {
  createChatInstanceV2,
  embeddingModel,
  createModerationInstance,
} from '../services/ChatService';
import {
  combineDocuments,
  limitChatHistory,
  zodUserInputValidator,
} from '../utills';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { VectorStoreMetadataFilter } from '@/app/lib/types/types';
import { normalizeAndSanitizeText } from '@/app/lib/utils/chain-utils';
import { logger } from '@/app/lib/utils/logger';
import { OpenAIModerationChain } from 'langchain/chains';
import { ChatOpenAI } from '@langchain/openai';

export interface ChainInput {
  question: string;
  chat_history: string | undefined;
}

export async function initializeQuestionAnsweringChain(orgId: string) {
  const vectorStore = createVectorStore(orgId);
  const contentModerator = await createModerationInstance(orgId);
  const questionRephraser = await createChatInstanceV2(
    orgId,
    modelParams.standaloneQuestion
  );
  const answerGenerator = await createChatInstanceV2(orgId, modelParams.answer);

  return RunnableSequence.from<ChainInput, string>([
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
}

function sanitizeAndValidateInput() {
  return new RunnableLambda({
    func: (input: ChainInput) => ({
      question: zodUserInputValidator(
        normalizeAndSanitizeText(input.question),
        MAX_USER_INPUT_LENGTH
      ).question,
      chat_history: limitChatHistory(
        input.chat_history,
        HISTORY_CHARACTER_LIMIT
      ),
    }),
  }).withConfig({
    runName: 'Sanitize and validate input',
  });
}

function moderateContent(moderationInstance: OpenAIModerationChain) {
  return new RunnableLambda({
    func: async (input: ChainInput) => {
      try {
        const contentToModerate = `${input.question} ${input.chat_history}`;

        const { results } = await moderationInstance.invoke({
          input: contentToModerate,
        });

        const moderationResult = results[0];
        if (!moderationResult) {
          throw new Error('Moderation failed: No results returned');
        }

        if (moderationResult.flagged) {
          throw new Error('Input is flagged by moderation model');
        }

        return input;
      } catch (error) {
        logger.error('Moderation chain error: %o', error);
        throw new Error('Content moderation failed');
      }
    },
  }).withConfig({
    runName: 'Moderate content',
  });
}

function rephraseQuestion(
  modelInstance: ChatOpenAI
): Runnable<ChainInput, string> {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', ThreadConversationPrompts.systemTemplates.rephraseQuestion],
    new MessagesPlaceholder('chat_history'),
    ['human', ThreadConversationPrompts.humanTemplates.rephraseQuestion],
  ]);

  return RunnableSequence.from([
    promptTemplate,
    modelInstance,
    new StringOutputParser(),
  ]).withConfig({
    runName: 'Rephrase question',
  });
}

function createVectorStore(orgId: string): SupabaseVectorStore {
  const metadataFilter: VectorStoreMetadataFilter = {
    organization_id: orgId.toLowerCase(),
  };

  return new SupabaseVectorStore(embeddingModel, {
    client: supabaseVectorStoreClient,
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
    filter: metadataFilter,
  });
}

function retrieveRelevantDocuments(vectorStore: SupabaseVectorStore) {
  return RunnableSequence.from([
    (input) => input.standalone_question,
    vectorStore.asRetriever(),
    combineDocuments,
  ]).withConfig({
    runName: 'Retrieve relevant documents',
  });
}

function generateFinalAnswer(modelInstance: ChatOpenAI, runName: string) {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', ThreadConversationPrompts.systemTemplates.answerChain],
    new MessagesPlaceholder('chat_history'),
    ['human', ThreadConversationPrompts.humanTemplates.answerChain],
  ]);
  return RunnableSequence.from([
    promptTemplate,
    modelInstance,
    new StringOutputParser().withConfig({
      runName,
    }),
  ]).withConfig({
    runName: 'Generate final answer',
  });
}
