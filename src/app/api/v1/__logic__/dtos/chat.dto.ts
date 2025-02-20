import { z } from 'zod';

export const chatMessagesSchema = z.object({
  content: z.string().min(10),
});

export type ChatMessageDto = z.infer<typeof chatMessagesSchema>;
