import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  humanTemplates,
  systemTemplates,
} from './config';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { buildUserMessageWithImages } from '../utils/chain-utils';

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

export function buildConversationMessages(
  question: string,
  chatHistory: string | undefined,
  answerInstructions?: string | null,
  projectInstruction?: string,
  imageDocuments?: ThreadDocumentUI[],
): { system: string; messages: ModelMessage[] } {
  const effectiveAnswerInstructions =
    answerInstructions || DEFAULT_ANSWER_INSTRUCTIONS;
  const effectiveProjectInstructions = projectInstruction || '';

  const systemMessage = systemTemplates.answerChain
    .replace('{answer_instructions}', effectiveAnswerInstructions)
    .replace('{project_instructions}', effectiveProjectInstructions);

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
    '{question}',
    question,
  );

  messages.push({
    role: 'user',
    content: buildUserMessageWithImages(humanMessage, imageDocuments),
  });

  return { system: systemMessage, messages };
}

export function validateAnswerGenerator(model: LanguageModelV3): void {
  if (!model) {
    throw new Error('Error generating final answer: No model instance');
  }
}
