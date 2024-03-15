import { z } from 'zod';

export const messageSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
});

export type CreateMessageDto = z.infer<typeof messageSchema>;
