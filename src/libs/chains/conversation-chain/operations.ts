import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  humanTemplates,
  systemTemplates,
} from './config';
import { AIMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';

type Message = {
  type: 'user' | 'assistant';
  content: string;
};

function formatChatHistory(chatHistory: string): Message[] {
  // Split the chat history into lines and remove empty lines
  const lines = chatHistory.split('\n').filter((line) => line.trim());

  const messages: Message[] = [];

  lines.forEach((line) => {
    // Check if line starts with "USER: " or "ASSISTANT: "
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

export const generateFinalAnswer = (
  model: BaseChatModel,
  runName: string,
  answerInstructions?: string | null,
  projectInstruction?: string
) => {
  if (!model) {
    throw new Error('Error generating final answer: No model instance');
  }

  const getPromptTemplate = (chatHistory: string) => {
    const formattedChatHistory = formatChatHistory(chatHistory);
    const messages = formattedChatHistory.map((m) => {
      if (m.type === 'user') {
        return new HumanMessage(m.content);
      } else {
        return new AIMessage(m.content);
      }
    });

    return ChatPromptTemplate.fromMessages([
      ['system', systemTemplates.answerChain],
      ...messages,
      ['human', humanTemplates.answerChain],
    ]);
  };

  return RunnableSequence.from([
    (input) => ({
      ...input,
      answer_instructions: answerInstructions || DEFAULT_ANSWER_INSTRUCTIONS,
      project_instructions: projectInstruction ? { projectInstruction } : '',
    }),
    async (input) => {
      const promptTemplate = getPromptTemplate(input.chat_history);
      return { ...input, promptTemplate };
    },
    async (input) => {
      const { promptTemplate, ...rest } = input;
      return promptTemplate.invoke(rest);
    },
    model,
    new StringOutputParser().withConfig({
      runName,
    }),
  ]).withConfig({
    runName: 'Generate final answer',
  });
};
