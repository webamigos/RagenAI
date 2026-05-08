import type { SuggestionDimensions } from '@/features/documents/contracts/optimization-suggestion.types';

export const DIMENSION_LABELS: Record<keyof SuggestionDimensions, string> = {
  chunkStructure: 'Struktura',
  avgChunkSize: 'Rozmiar chunków',
  entityDensity: 'Encje',
  selfContainedness: 'Samowystarczalność',
  qaAdherence: 'Format Q&A',
};
