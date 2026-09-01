import { z } from 'zod';

export const suggestionTypeSchema = z.enum([
  'restructure',
  'chunk_split',
  'pronoun_context',
  'terminology',
  'keywords',
  'redundancy',
]);

export type SuggestionType = z.infer<typeof suggestionTypeSchema>;

export const dimensionResultSchema = z.object({
  improved: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
});

export type DimensionResult = z.infer<typeof dimensionResultSchema>;

export const suggestionDimensionsSchema = z.object({
  chunkStructure: dimensionResultSchema.optional(),
  avgChunkSize: dimensionResultSchema.optional(),
  entityDensity: dimensionResultSchema.optional(),
  selfContainedness: dimensionResultSchema.optional(),
  qaAdherence: dimensionResultSchema.optional(),
});

export type SuggestionDimensions = z.infer<typeof suggestionDimensionsSchema>;

export const optimizationSuggestionSchema = z.object({
  id: z.string(),
  type: suggestionTypeSchema,
  location: z
    .string()
    .describe('Description of where in the document this change applies'),
  before: z.string().describe('Original text fragment'),
  after: z.string().describe('Suggested replacement text'),
  rationale: z.string().describe('Why this change improves RAG retrieval'),
  dimensions: suggestionDimensionsSchema.default({}),
  stale: z
    .boolean()
    .optional()
    .describe(
      'True when the before fragment no longer exists in the document after other suggestions were applied',
    ),
});

export type OptimizationSuggestion = z.infer<
  typeof optimizationSuggestionSchema
>;

export const optimizationSuggestionsResponseSchema = z.object({
  suggestions: z.array(optimizationSuggestionSchema).min(1).max(20),
});

export type OptimizationSuggestionsResponse = z.infer<
  typeof optimizationSuggestionsResponseSchema
>;

/**
 * Ids only — the server reads the suggestion bodies from the stored job so a
 * version stamped AI_OPTIMIZE contains what the model proposed.
 */
export type ApplySuggestionsRequest = {
  acceptedSuggestionIds: string[];
  rejectedSuggestionIds?: string[];
};

export type ApplySuggestionsResult = {
  newVersionId: string;
  newVersionNumber: number;
  newRagScore: import('./rag-score.types').RagScore | null;
};
