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

export type CreateChatbotDto = {
  name: string;
  selectedFileIds?: string[];
  allowedOrigins?: string[];
  themeConfig?: ChatbotThemeConfig;
};

export type UpdateChatbotDto = Partial<CreateChatbotDto> & {
  isActive?: boolean;
};

export type ChatbotPublicConfig = {
  name: string;
  themeConfig: ChatbotThemeConfig;
};
