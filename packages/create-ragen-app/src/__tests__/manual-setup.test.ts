import { describe, expect, it } from 'vitest';

import { manualLlmSetupInstructions } from '../manual-setup';
import { LLM_PROVIDERS, resolveLlmProviderChoice } from '../llm-provider';

const guide = manualLlmSetupInstructions();

describe('manualLlmSetupInstructions', () => {
  it('covers every provider the wizard can configure', () => {
    for (const config of Object.values(LLM_PROVIDERS)) {
      expect(guide).toContain(config.label);
      expect(guide).toContain(`${config.apiKeyEnvVar}=`);
      expect(guide).toContain(`DEFAULT_MODEL=${config.modelName}`);
      expect(guide).toContain(`model: ${config.litellmModel}`);
    }
  });

  it('tells the reader the same thing the wizard would have written', () => {
    // The point of generating this from LLM_PROVIDERS: someone who declines
    // the prompt and follows the file by hand must end up with the install
    // the wizard would have produced, not an approximation of it.
    for (const choice of ['openai', 'anthropic'] as const) {
      const { envUpdates } = resolveLlmProviderChoice(choice, '<key>');
      for (const [key, value] of Object.entries(envUpdates)) {
        if (key === LLM_PROVIDERS[choice].apiKeyEnvVar) {
          continue;
        }
        expect(guide).toContain(`${key}=${value}`);
      }
    }
  });

  it('gives OpenAI an embedding model and its matching vector size', () => {
    expect(guide).toContain('EMBEDDINGS_MODEL=text-embedding-3-small');
    expect(guide).toContain('VECTOR_SIZE=1536');
    expect(guide).toContain('model: openai/text-embedding-3-small');
  });

  it('says plainly that Anthropic cannot serve embeddings', () => {
    // The branch that would otherwise read as an omission. Silently leaving
    // EMBEDDINGS_MODEL out is the correct behaviour, so the file has to
    // explain it or it looks like the instructions are incomplete.
    expect(LLM_PROVIDERS.anthropic.embeddings).toBeUndefined();
    expect(guide).toMatch(/Anthropic has no embeddings API/);
  });

  it('warns that VECTOR_SIZE is fixed at the first index, not later', () => {
    // Qdrant freezes a collection's dimensionality on creation; getting this
    // wrong is only visible as rejected upserts much later.
    expect(guide).toMatch(/VECTOR_SIZE.*before/s);
  });

  it('names both files to edit and how to apply them', () => {
    expect(guide).toContain('.env.local');
    expect(guide).toContain('infra/litellm/config.yaml');
    expect(guide).toContain('docker compose restart litellm');
  });
});
