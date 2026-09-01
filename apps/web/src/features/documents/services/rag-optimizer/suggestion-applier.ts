import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

export type AppliedSuggestion = {
  id: string;
  applied: boolean;
};

export type ApplySuggestionsOutcome = {
  content: string;
  results: AppliedSuggestion[];
};

/**
 * Rewrite `content` by substituting each suggestion's `before` with its
 * `after`, reporting which ones actually matched.
 *
 * Two things are deliberate here.
 *
 * The replacement is a function, not a string. `String.replace` treats `$&`,
 * `` $` ``, `$'` and `$1` in a *string* replacement as substitution patterns —
 * and `after` is model-generated prose that can legitimately contain a `$`.
 * The document would then gain text nobody proposed.
 *
 * And a `before` that no longer matches is reported rather than skipped in
 * silence. Suggestions are applied in sequence, so an earlier one can consume
 * the text a later one was written against; telling the user their change was
 * applied when it was not is worse than telling them it went stale.
 */
export function applySuggestions(
  content: string,
  suggestions: OptimizationSuggestion[],
): ApplySuggestionsOutcome {
  let result = content;
  const results: AppliedSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (!suggestion.before || !suggestion.after) {
      results.push({ id: suggestion.id, applied: false });
      continue;
    }

    if (!result.includes(suggestion.before)) {
      results.push({ id: suggestion.id, applied: false });
      continue;
    }

    result = result.replace(suggestion.before, () => suggestion.after);
    results.push({ id: suggestion.id, applied: true });
  }

  return { content: result, results };
}
