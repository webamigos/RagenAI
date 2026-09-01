import { generateObject } from 'ai';
import { z } from 'zod';
import { getChatModelForOrg } from '../../services/llm/provider';
import { withLangfuseTrace } from '../../services/langfuse-trace';
import { logger } from '../../services/logger';
import { SUMMARY_MODEL } from '../../consts';

type SuggestionType =
  | 'restructure'
  | 'chunk_split'
  | 'pronoun_context'
  | 'terminology'
  | 'keywords'
  | 'redundancy';

export type DimensionResult = {
  improved: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

export type SuggestionDimensions = {
  chunkStructure?: DimensionResult;
  avgChunkSize?: DimensionResult;
  entityDensity?: DimensionResult;
  selfContainedness?: DimensionResult;
  qaAdherence?: DimensionResult;
};

const dimensionResultSchema = z.object({
  improved: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().describe('Jedno zdanie po polsku wyjaśniające ocenę'),
});

type Dimension = keyof SuggestionDimensions;

const DIMENSION_PROMPTS: Record<Dimension, string> = {
  chunkStructure:
    'Does the AFTER version have better heading structure for text chunking than BEFORE? Consider: presence of headings (###), logical section boundaries, consistent hierarchy.',
  avgChunkSize:
    'Is the AFTER version better sized for embedding models (80–500 words per section) than BEFORE? Consider: sections that are neither too short (<80 words) nor too long (>500 words).',
  entityDensity:
    'Does the AFTER version contain more specific, searchable entities than BEFORE? Consider: proper names, monetary amounts, dates, legal article numbers, contact details.',
  selfContainedness:
    'Is the AFTER version more self-contained than BEFORE? Consider: does each section make sense without reading other sections, are key references repeated.',
  qaAdherence:
    'Does the AFTER version follow a question-answer format better than BEFORE? Consider: question-style headings, clear Q&A structure.',
};

const TYPE_TO_DIMENSIONS: Record<SuggestionType, Dimension[]> = {
  restructure: ['chunkStructure', 'avgChunkSize', 'selfContainedness'],
  chunk_split: ['chunkStructure', 'avgChunkSize'],
  pronoun_context: ['selfContainedness'],
  terminology: ['selfContainedness', 'entityDensity'],
  keywords: ['entityDensity'],
  redundancy: ['avgChunkSize', 'selfContainedness'],
};

async function evaluateDimension(
  dimension: Dimension,
  before: string,
  after: string,
  model: Awaited<ReturnType<typeof getChatModelForOrg>>,
): Promise<DimensionResult | null> {
  try {
    const result = await withLangfuseTrace(
      {
        name: `rag-eval-dimension-${dimension}`,
        tags: ['rag-dimension-eval', SUMMARY_MODEL],
      },
      () =>
        generateObject({
          model,
          schema: dimensionResultSchema,
          system: DIMENSION_PROMPTS[dimension],
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: `BEFORE:\n${before}\n\nAFTER:\n${after}`,
            },
          ],
          experimental_telemetry: { isEnabled: true },
        }),
    );

    return result.object;
  } catch (err) {
    logger.warn(
      { err, dimension },
      'evaluateSuggestionDimensions: dimension call failed',
    );
    return null;
  }
}

export async function evaluateSuggestionDimensions({
  before,
  after,
  suggestionType,
  orgId,
}: {
  before: string;
  after: string;
  suggestionType: SuggestionType;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
}): Promise<SuggestionDimensions> {
  const dimensions = TYPE_TO_DIMENSIONS[suggestionType] ?? [];

  if (dimensions.length === 0) {
    return {};
  }

  const model = await getChatModelForOrg(orgId, SUMMARY_MODEL);

  const results = await Promise.all(
    dimensions.map((dim) => evaluateDimension(dim, before, after, model)),
  );

  const output: SuggestionDimensions = {};

  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const value = results[i];
    if (value?.improved) {
      output[dim] = value;
    }
  }

  logger.info(
    {
      suggestionType,
      orgId,
      evaluated: dimensions.length,
      improved: Object.keys(output).length,
    },
    'evaluateSuggestionDimensions: done',
  );

  return output;
}
