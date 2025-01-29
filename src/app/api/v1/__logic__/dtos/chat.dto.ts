import { z } from 'zod';

export const chatMessagesSchema = z.object({
  messages: z.array(
    z
      .object({
        content: z.string().min(10),
      })
      .optional()
  ),
});

export type ChatMessageDto = z.infer<typeof chatMessagesSchema>;
