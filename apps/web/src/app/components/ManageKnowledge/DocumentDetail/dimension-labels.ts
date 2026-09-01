import type { SuggestionDimensions } from '@/features/documents/contracts/optimization-suggestion.types';

/**
 * The scoring dimensions, in the order the scorer reports them. Labels live in
 * the message catalogue under `document-optimize.dimension.<key>`.
 */
export const DIMENSION_KEYS = [
  'chunkStructure',
  'avgChunkSize',
  'entityDensity',
  'selfContainedness',
  'qaAdherence',
] as const satisfies ReadonlyArray<keyof SuggestionDimensions>;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];
