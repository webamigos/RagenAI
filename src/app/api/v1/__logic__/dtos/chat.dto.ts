import { z } from 'zod';

export const chatMessagesSchema = z.object({
  content: z.string().min(10),
  messageType: z.enum(['TEXT', 'VOICE']).optional(),
  voiceDurationSeconds: z.number().optional(),
});

export type ChatMessageDto = z.infer<typeof chatMessagesSchema>;
