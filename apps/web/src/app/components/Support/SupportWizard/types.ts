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
          .superRefine((fl, ctx) => {
            if (!fl || fl.length === 0) {
              return;
            }
            for (const file of Array.from(fl)) {
              if (file.size > MAX_FILE_SIZE) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'file-size',
                });
                return;
              }
            }
          }),
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
