import { describe, expect, it } from 'vitest';

import { resolveAnswerFromDocumentsOnly } from '../retrieval/answer-from-documents-only';

describe('resolveAnswerFromDocumentsOnly', () => {
  it.each([
    // An unset column follows the surface: strict for a public chatbot.
    [null, true, true],
    [null, false, false],
    [undefined, true, true],
    [undefined, false, false],
    // A set column wins over the surface in both directions.
    [true, true, true],
    [true, false, true],
    [false, true, false],
    [false, false, false],
  ] as const)(
    'setting %s with chatbot %s resolves to %s',
    (setting, chatbotEnabled, expected) => {
      expect(resolveAnswerFromDocumentsOnly({ setting, chatbotEnabled })).toBe(
        expected,
      );
    },
  );
});
