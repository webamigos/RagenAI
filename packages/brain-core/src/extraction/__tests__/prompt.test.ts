import { describe, expect, it } from 'vitest';

import { extractionUserPrompt, languageName } from '../prompt';

const base = {
  fileName: 'a.md',
  window: 'tekst',
  windowIndex: 0,
  windowCount: 1,
};

describe('extractionUserPrompt', () => {
  // B5's first run: told only "the language of the excerpt", the model wrote
  // English descriptions for a Polish document.
  it('names a known language outright', () => {
    expect(extractionUserPrompt({ ...base, language: 'pol' })).toContain(
      'Language: Polish. Write every title, description, statement and kind in Polish.',
    );
  });

  it('falls back to the excerpt when the language is unknown', () => {
    for (const language of [null, undefined, 'xyz']) {
      expect(extractionUserPrompt({ ...base, language })).toContain(
        'Language: the language of the excerpt.',
      );
    }
  });

  it('says which excerpt of how many', () => {
    expect(
      extractionUserPrompt({ ...base, windowIndex: 1, windowCount: 3 }),
    ).toContain('(excerpt 2 of 3)');
  });
});

describe('languageName', () => {
  it.each([
    ['pol', 'Polish'],
    ['ENG', 'English'],
    ['und', null],
    [null, null],
  ])('%s → %s', (code, name) => {
    expect(languageName(code)).toBe(name);
  });
});
