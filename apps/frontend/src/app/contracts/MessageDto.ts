import { z } from 'zod';

export const createMessageSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
});

export type CreateMessageDto = z.infer<typeof createMessageSchema>;
