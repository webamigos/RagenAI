import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';
import { generateText } from 'ai';
import type { VectorStoreClient } from '@/libs/vector-store/types';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { BaseChatChainInput } from '../types/common';
import { combineDocuments } from '../utils/chain-utils';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  humanTemplates,
  systemTemplates,
} from './config';
import { ThreadDocumentRetriever } from '../utils/ThreadDocumentRetriever';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';

type Message = {
  type: 'user' | 'assistant';
  content: string;
};

function formatChatHistory(chatHistory: string): Message[] {
  const lines = chatHistory.split('\n').filter((line) => line.trim());
  const messages: Message[] = [];

  lines.forEach((line) => {
    if (line.startsWith('USER: ')) {
      messages.push({
        type: 'user',
        content: line.replace('USER: ', '').trim(),
      });
    } else if (line.startsWith('ASSISTANT: ')) {
      messages.push({
        type: 'assistant',
        content: line.replace('ASSISTANT: ', '').trim(),
      });
    }
  });

  return messages;
}

export async function rephraseQuestion(
  model: LanguageModelV3,
  input: BaseChatChainInput,
): Promise<string> {
  if (!model) {
    throw new Error('Error rephrasing question: No model instance');
  }

  const messages: ModelMessage[] = [];

  if (input.chat_history) {
    const formattedHistory = formatChatHistory(input.chat_history);
    for (const msg of formattedHistory) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  const humanMessage = humanTemplates.rephraseQuestion.replace(
    '{question}',
    input.question,
  );
  messages.push({ role: 'user', content: humanMessage });

  const result = await generateText({
    model,
    system: systemTemplates.rephraseQuestion,
    messages,
  });

  return result.text;
}

export async function retrieveRelevantDocuments(
  vectorStore: VectorStoreClient,
  standaloneQuestion: string,
  maxDocuments = 4,
  metadataFilter?: object,
): Promise<string> {
  if (!vectorStore) {
    throw new Error('Error retrieving relevant documents: No vector store');
  }

  const filter =
    metadataFilter && Object.keys(metadataFilter).length > 0
      ? metadataFilter
      : undefined;

  const docs = await vectorStore.similaritySearch(
    standaloneQuestion,
    maxDocuments,
    filter,
  );

  return combineDocuments(docs);
}

export async function retrieveThreadDocuments(
  threadDocuments: ThreadDocumentUI[],
  vectorStore: VectorStoreClient,
  embeddings: EmbeddingsProvider,
  standaloneQuestion: string,
  maxChunks: number = 3,
): Promise<string> {
  if (!threadDocuments || threadDocuments.length === 0) {
    return '[Brak dokumentow watku - uzytkownik nie wgral zadnych plikow]';
  }

  const retriever = new ThreadDocumentRetriever(vectorStore, embeddings);
  const relevantChunks = await retriever.retrieveRelevantChunks(
    threadDocuments,
    standaloneQuestion,
    maxChunks,
  );

  return combineDocuments(relevantChunks);
}

export function buildRagMessages(
  standaloneQuestion: string,
  chatHistory: string | undefined,
  context: string,
  threadContext: string,
  answerInstructions?: string | null,
  projectInstructions?: string,
): { system: string; messages: ModelMessage[] } {
  const effectiveAnswerInstructions =
    answerInstructions || DEFAULT_ANSWER_INSTRUCTIONS;
  const effectiveProjectInstructions = projectInstructions || '';

  const systemMessage = systemTemplates.answerChain
    .replace('{answer_instructions}', effectiveAnswerInstructions)
    .replace('{project_instructions}', effectiveProjectInstructions)
    .replace('{context}', context)
    .replace('{thread_context}', threadContext);

  const messages: ModelMessage[] = [];

  if (chatHistory) {
    const formattedHistory = formatChatHistory(chatHistory);
    for (const msg of formattedHistory) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  const humanMessage = humanTemplates.answerChain.replace(
    '{standalone_question}',
    standaloneQuestion,
  );
  messages.push({ role: 'user', content: humanMessage });

  return { system: systemMessage, messages };
}

export function validateAnswerGenerator(model: LanguageModelV3): void {
  if (!model) {
    throw new Error('Error generating final answer: No model instance');
  }
}
