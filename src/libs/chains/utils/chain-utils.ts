import { z } from 'zod';
import { VectorStoreDocument } from '../types/chain';

export const normalizeAndSanitizeText = (input: string) => {
  return input
    .replace(/[^\S\n]+/g, ' ') // Replace multiple whitespaces (except newlines) with a single space
    .replace(/\n+/g, '\n') // Replace multiple newlines with a single newline
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{S}\n]/gu, '') // Allow letters, numbers, punctuation, spaces, and symbols
    .normalize('NFKC') // Normalize Unicode characters
    .trim(); // Remove leading and trailing whitespace
};

export const combineDocuments = (docs: VectorStoreDocument[]) => {
  return docs.map((doc) => doc.pageContent).join('\n\n');
};

export const zodUserInputValidator = (input: string, maxLength: number) => {
  const schema = z.object({
    question: z.string().min(1).max(maxLength),
  });

  return schema.parse({ question: input });
};

//Very naive implementation, consider using a more sophisticated approach like history summarization
export const limitChatHistory = (
  history: string | undefined,
  limit: number
) => {
  return history ? history.slice(-limit) : undefined;
};
