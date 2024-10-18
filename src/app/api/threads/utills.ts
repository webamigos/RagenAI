import { z } from 'zod';

type Document = {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
};

function combineDocuments(docs: Document[]) {
  return docs.map((doc) => doc.pageContent).join('\n\n');
}

function sanitizeInput(input: string) {
  return input
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove non-alphanumeric characters
    .replace(/\s+/g, ' ') // Replace multiple whitespaces with a single space
    .replace(/\n+/g, '\n') // Replace multiple newlines with a single newline
    .trim(); // Remove leading and trailing whitespace
}

function zodUserInputValidator(input: string, maxLength: number) {
  const schema = z.object({
    question: z.string().min(1).max(maxLength),
  });

  return schema.parse({ question: input });
}

//Very naive implementation, consider using a more sophisticated approach like history summarization
function limitChatHistory(history: string | undefined, limit: number) {
  return history ? history.slice(-limit) : undefined;
}

export {
  combineDocuments,
  sanitizeInput,
  zodUserInputValidator,
  limitChatHistory,
};
