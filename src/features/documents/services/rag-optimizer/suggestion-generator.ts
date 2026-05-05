import { generateObject } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { randomUUID } from 'crypto';
import {
  optimizationSuggestionsResponseSchema,
  type OptimizationSuggestion,
} from '@/features/documents/contracts/optimization-suggestion.types';
import { RAG_OPTIMIZATION_RULES } from './rag-rules';
import { logger } from '@/app/lib/utils/logger';

const MAX_CONTENT_LENGTH = 100_000;

export async function generateSuggestions(
  content: string,
  model: LanguageModelV3,
): Promise<OptimizationSuggestion[]> {
  const truncated =
    content.length > MAX_CONTENT_LENGTH
      ? content.slice(0, MAX_CONTENT_LENGTH)
      : content;

  const result = await generateObject({
    model,
    schema: optimizationSuggestionsResponseSchema,
    system: RAG_OPTIMIZATION_RULES,
    messages: [
      {
        role: 'user',
        content: `Analyze this document and propose specific RAG optimization suggestions:\n\n${truncated}`,
      },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'kb-suggestion-generator',
      recordInputs: false,
      recordOutputs: false,
    },
  });

  const suggestions = result.object.suggestions.map((s) => ({
    ...s,
    id: s.id || randomUUID(),
  }));

  logger.info(
    { count: suggestions.length },
    'Generated RAG optimization suggestions',
  );

  return suggestions;
}
