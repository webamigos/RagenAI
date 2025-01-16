import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';

export const generateFinalAnswer = (model: BaseChatModel, runName: string) => {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', 'You are an expert at answering questions.'],
    ['human', 'Answer to: {question}'],
  ]);

  return RunnableSequence.from([
    promptTemplate,
    model,
    new StringOutputParser().withConfig({
      runName,
    }),
  ]).withConfig({
    runName: 'Generate final answer',
  });
};
