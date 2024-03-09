import { z } from 'zod';

export const promptSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
});

export type PromptDto = z.infer<typeof promptSchema>;
