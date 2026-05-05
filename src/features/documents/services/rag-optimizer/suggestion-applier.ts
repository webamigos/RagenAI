import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

export function applySuggestions(
  content: string,
  suggestions: OptimizationSuggestion[],
): string {
  let result = content;
  for (const suggestion of suggestions) {
    result = result.replace(suggestion.before, suggestion.after);
  }
  return result;
}
