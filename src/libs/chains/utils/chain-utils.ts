import { z } from 'zod';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import type { ModerationInstance } from '@/app/lib/services/llm';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { ModerationError } from '../errors';

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
  limit: number,
) => {
  return history ? history.slice(-limit) : undefined;
};

export function partitionThreadDocuments(docs: ThreadDocumentUI[]): {
  textDocs: ThreadDocumentUI[];
  imageDocs: ThreadDocumentUI[];
} {
  const textDocs: ThreadDocumentUI[] = [];
  const imageDocs: ThreadDocumentUI[] = [];
  for (const doc of docs) {
    if (doc.imageData) {
      imageDocs.push(doc);
    } else {
      textDocs.push(doc);
    }
  }
  return { textDocs, imageDocs };
}

export function buildUserMessageWithImages(
  humanMessage: string,
  imageDocuments?: ThreadDocumentUI[],
):
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> {
  if (!imageDocuments || imageDocuments.length === 0) {
    return humanMessage;
  }
  const content: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string }
  > = [{ type: 'text', text: humanMessage }];
  for (const imgDoc of imageDocuments) {
    if (imgDoc.imageData) {
      content.push({ type: 'image', image: imgDoc.imageData });
    }
  }
  return content;
}

export const runModeration = async (
  moderationInstance: ModerationInstance,
  contentToModerate: string,
): Promise<void> => {
  const { results } = await moderationInstance.invoke({
    input: contentToModerate,
  });

  const moderationResult = results[0];
  if (!moderationResult) {
    throw new ModerationError('No results returned from moderation model');
  }

  if (moderationResult.flagged) {
    throw new ModerationError();
  }
};
