import { z } from 'zod';

export const querySchema = z.object({
  content: z.string().min(10),
});

export type QueryDto = z.infer<typeof querySchema>;
