export type ModelOrigin = 'openai' | 'google' | 'anthropic' | 'perplexity';

export type ModelDefinition = {
  value: string;
  label: string;
  origin: ModelOrigin;
};

export const allModels: ModelDefinition[] = [
  { value: 'openai/gpt-5.3-chat', label: 'GPT-5.3 Chat', origin: 'openai' },
  {
    value: 'openai/gpt-5.2',
    label: 'GPT-5.2 Thinking',
    origin: 'openai',
  },
  {
    value: 'openai/gpt-5.2-chat',
    label: 'GPT-5.2 Instant',
    origin: 'openai',
  },
  {
    value: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    origin: 'google',
  },
  {
    value: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    origin: 'anthropic',
  },
  {
    value: 'anthropic/claude-opus-4.6',
    label: 'Claude Opus 4.6',
    origin: 'anthropic',
  },
  {
    value: 'perplexity/sonar-pro',
    label: 'Perplexity Sonar Pro',
    origin: 'perplexity',
  },
];

export const originDisplayNames: Record<ModelOrigin, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  perplexity: 'Perplexity',
};

export const originOrder: ModelOrigin[] = [
  'openai',
  'google',
  'anthropic',
  'perplexity',
];

export function groupModelsByOrigin(models: ModelDefinition[]) {
  const grouped: Record<string, ModelDefinition[]> = {};
  for (const model of models) {
    if (!grouped[model.origin]) {
      grouped[model.origin] = [];
    }
    grouped[model.origin].push(model);
  }
  return originOrder
    .filter((origin) => grouped[origin])
    .map((origin) => ({
      origin,
      displayName: originDisplayNames[origin],
      models: grouped[origin],
    }));
}
