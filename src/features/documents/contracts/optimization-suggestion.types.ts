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

export const optimizationSuggestionSchema = z.object({
  id: z.string(),
  type: suggestionTypeSchema,
  location: z
    .string()
    .describe('Description of where in the document this change applies'),
  before: z.string().describe('Original text fragment'),
  after: z.string().describe('Suggested replacement text'),
  rationale: z.string().describe('Why this change improves RAG retrieval'),
  expectedScoreDelta: z.number().describe('Expected change in total RAG score'),
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

export type ApplySuggestionsRequest = {
  acceptedSuggestionIds: string[];
  suggestions: OptimizationSuggestion[];
};

export type ApplySuggestionsResult = {
  newVersionId: string;
  newVersionNumber: number;
  newRagScore: import('./rag-score.types').RagScore | null;
};
