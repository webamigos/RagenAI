import { z } from 'zod';

export type ChatbotThemeConfig = {
  primaryColor?: string;
  bubbleColor?: string;
  position?: 'left' | 'right';
  welcomeMessage?: string;
  botName?: string;
};

export const themeConfigSchema = z
  .object({
    primaryColor: z.string().optional(),
    bubbleColor: z.string().optional(),
    position: z.enum(['left', 'right']).optional(),
    welcomeMessage: z.string().max(500).optional(),
    botName: z.string().max(100).optional(),
  })
  .optional();

export const createChatbotSchema = z.object({
  name: z.string().min(1),
  selectedFileIds: z.array(z.string()).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  themeConfig: themeConfigSchema,
  chatbotPrompt: z.string().optional(),
});
export type CreateChatbotDto = z.infer<typeof createChatbotSchema>;

export const updateChatbotSchema = createChatbotSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateChatbotDto = z.infer<typeof updateChatbotSchema>;

export type ChatbotPublicConfig = {
  name: string;
  themeConfig: ChatbotThemeConfig;
};
