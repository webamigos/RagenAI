import { z } from 'zod';

export enum SupportCategory {
  Bug = 'bug',
  Question = 'question',
  Suggestion = 'suggestion',
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const bugSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  steps: z.string().min(10),
  screenshot:
    typeof window === 'undefined'
      ? z.any().optional()
      : z
          .instanceof(FileList)
          .optional()
          .transform((fl) => (fl && fl.length > 0 ? Array.from(fl) : undefined))
          .refine(
            (files) => !files || files.every((f) => f.size <= MAX_FILE_SIZE),
            { message: 'file-size' },
          ),
});

export const questionSchema = z.object({
  title: z.string().min(5),
  message: z.string().min(10),
});

export const suggestionSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
});

export type BugFormData = z.infer<typeof bugSchema>;
export type QuestionFormData = z.infer<typeof questionSchema>;
export type SuggestionFormData = z.infer<typeof suggestionSchema>;
