import { z } from 'zod';

export type ChatbotThemeConfig = {
  primaryColor?: string;
  bubbleColor?: string;
  position?: 'left' | 'right';
  welcomeMessage?: string;
  botName?: string;
  starterQuestions?: string[];
  avatarUrl?: string;
};

export const themeConfigSchema = z
  .object({
    primaryColor: z.string().optional(),
    bubbleColor: z.string().optional(),
    position: z.enum(['left', 'right']).optional(),
    welcomeMessage: z.string().max(500).optional(),
    botName: z.string().max(100).optional(),
    starterQuestions: z
      .array(z.string().trim().min(1).max(100))
      .max(5)
      .optional(),
    avatarUrl: z.string().max(500).optional(),
  })
  .optional();

export const createChatbotSchema = z.object({
  name: z.string().trim().min(1),
  // `guid`, not `uuid`: these are `user_files.id` values, Postgres uuids that
  // need no RFC 4122 version (see docs/lessons/zod-4-uuid-refuses-well-formed-database-ids.md).
  selectedFileIds: z.array(z.guid()).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  themeConfig: themeConfigSchema,
  chatbotPrompt: z.string().optional(),
});
export type CreateChatbotDto = z.infer<typeof createChatbotSchema>;

export const updateChatbotSchema = createChatbotSchema.partial().extend({
  isActive: z.boolean().optional(),
  chatbotPrompt: z.string().nullable().optional(),
});
export type UpdateChatbotDto = z.infer<typeof updateChatbotSchema>;

export type ChatbotPublicConfig = {
  name: string;
  themeConfig: ChatbotThemeConfig;
};
