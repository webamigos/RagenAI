import { type modelsSchema } from '@/app/lib/services/llm';
import { type z } from 'zod';

export type ModelConfig = z.infer<typeof modelsSchema>;
export type ModelProvider = ModelConfig['provider'];

export type LiteLLMCredentials = {
  provider: 'litellm';
  baseUrl: string;
  apiKey?: string;
};

export type ProviderCredentials = LiteLLMCredentials;
