import { z } from 'zod';

// Local equivalent of apps/web's modelsSchema (src/app/lib/services/llm.ts)
// — that file mixes in unrelated env-resolution logic not needed here.
export const modelsSchema = z.object({
  provider: z.literal('litellm'),
  model: z.string().min(1),
});

export type ModelConfig = z.infer<typeof modelsSchema>;
export type ModelProvider = ModelConfig['provider'];

export type LiteLLMCredentials = {
  provider: 'litellm';
  baseUrl: string;
  apiKey?: string;
};

export type ProviderCredentials = LiteLLMCredentials;
