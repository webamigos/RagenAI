import { DOCUMENT_SEARCH_QUERY_NAME } from '@/app/constants/vectorStore';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import db from '@salesyy/prisma-client';
import {
  CHAIN_FINAL_ANSWER_RUN_NAME,
  HISTORY_CHARACTER_LIMIT,
  MAX_USER_INPUT_LENGTH,
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
  sanitizeInput,
  zodUserInputValidator,
} from '../utills';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { VectorStoreMetadataFilter } from '@/app/lib/types/types';

interface QuestionAnsweringInput {
  question: string;
  chat_history: string | undefined;
}

export async function initializeQuestionAnsweringChain(orgId: string) {
  const vectorStore = createVectorStore(orgId);

  const rephraseQuestionChain = createRephraseQuestionChain(orgId);
  const documentRetrievalChain = createDocumentRetrievalChain(vectorStore);
  const moderationChain = createModerationChain(orgId);

  const answerChainModelParams = {
    modelName: 'gpt-4o',
    temperature: 0.8,
  };

  return RunnableSequence.from([
    // Sanitize user input and truncate chat history
    async (input: QuestionAnsweringInput) => {
      const { question } = zodUserInputValidator(
        sanitizeInput(input.question),
        MAX_USER_INPUT_LENGTH
      );
      const truncatedChatHistory = limitChatHistory(
        input.chat_history,
        HISTORY_CHARACTER_LIMIT
      );
      return {
        question,
        chat_history: truncatedChatHistory,
        contentToModerate: question + truncatedChatHistory,
      };
    },

    // Moderation chain
    RunnablePassthrough.assign({
      moderationPassed: (input) =>
        moderationChain(input.contentToModerate as string),
    }).withConfig({ runName: 'Moderation Chain' }),

    // Rephrase question chain
    RunnablePassthrough.assign({
      standalone_question: rephraseQuestionChain,
    }),

    // Document retrieval chain
    RunnablePassthrough.assign({
      context: documentRetrievalChain,
    }),

    // Answer chain
    ChatPromptTemplate.fromMessages([
      ['system', ThreadConversationPrompts.systemTemplates.answerChain],
      new MessagesPlaceholder('chat_history'),
      ['human', ThreadConversationPrompts.humanTemplates.answerChain],
    ]),

    () => createChatInstanceV2(orgId, answerChainModelParams),
    new StringOutputParser().withConfig({
      runName: CHAIN_FINAL_ANSWER_RUN_NAME,
    }),
  ]);
}

function createModerationChain(orgId: string) {
  return async (input: string) => {
    const moderationInstance = await createModerationInstance(orgId);
    const { results } = await moderationInstance.invoke({ input });

    const moderationResult = results[0];
    if (!moderationResult) {
      throw new Error('Moderation failed');
    }

    if (moderationResult.flagged) {
      throw new Error('Input is flagged by moderation model');
    }

    return true;
  };
}

function createVectorStore(orgId: string) {
  const metadataFilter: VectorStoreMetadataFilter = {
    organization_id: orgId.toLowerCase(),
  };

  return new SupabaseVectorStore(embeddingModel, {
    client: supabaseVectorStoreClient,
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
    filter: metadataFilter,
  });
}

function createDocumentRetrievalChain(vectorStore: SupabaseVectorStore) {
  return RunnableSequence.from([
    (input) => input.standalone_question,
    vectorStore.asRetriever(),
    combineDocuments,
  ]);
}

function createRephraseQuestionChain(orgId: string) {
  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ['system', ThreadConversationPrompts.systemTemplates.rephraseQuestion],
    new MessagesPlaceholder('chat_history'),
    ['human', ThreadConversationPrompts.humanTemplates.rephraseQuestion],
  ]);

  const standaloneQuestionModelParams = {
    modelName: 'gpt-4o-mini',
    temperature: 0,
  };

  return RunnableSequence.from([
    rephraseQuestionChainPrompt,
    () => createChatInstanceV2(orgId, standaloneQuestionModelParams),
    new StringOutputParser(),
  ]);
}
