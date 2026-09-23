import { contentHashSchema } from '@ragenai/brain-contracts';
import { describe, expect, it } from 'vitest';

import { QuoteIndex } from '../extraction/verify-quotes';
import { splitIntoWindows } from '../extraction/windows';
import { quoteHash, sha256, slugify } from '../text';

describe('slugify', () => {
  it.each([
    ['Zasady urlopów', 'zasady-urlopow'],
    ['Łódź — oddział', 'lodz-oddzial'],
    ['Żółć i gęślą jaźń', 'zolc-i-gesla-jazn'],
    ['  --Dział IT!!  ', 'dzial-it'],
    ['???', 'page'],
  ])('%j → %j', (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });

  it('stays within 80 characters and does not end on a hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('hashes', () => {
  it('is in the shape the contract accepts', () => {
    expect(contentHashSchema.safeParse(sha256('x')).success).toBe(true);
  });

  it('hashes a quote the same across line breaks and typography', () => {
    expect(quoteHash('Wniosek  zatwierdza\n„przełożony”')).toBe(
      quoteHash('wniosek zatwierdza "przełożony"'),
    );
  });
});

describe('QuoteIndex', () => {
  const index = new QuoteIndex(
    'Wniosek urlopowy składa się w systemie kadrowym co naj\u00admniej 14 dni\nprzed planowanym urlopem – zawsze.',
  );

  it('finds a quote across a line break, a soft hyphen and a dash', () => {
    expect(
      index.contains('co najmniej 14 dni przed planowanym urlopem - zawsze'),
    ).toBe(true);
  });

  it('does not find a quote with one word changed', () => {
    expect(index.contains('co najmniej 7 dni przed planowanym urlopem')).toBe(
      false,
    );
  });

  it('does not find an empty quote', () => {
    expect(index.contains('   ')).toBe(false);
  });
});

describe('splitIntoWindows', () => {
  it('keeps a short document whole', () => {
    expect(splitIntoWindows('  abc  ', 100)).toEqual(['abc']);
  });

  it('prefers to cut at a heading', () => {
    const text = `# A\n${'x'.repeat(60)}\n\npara\n## B\n${'y'.repeat(20)}`;
    const windows = splitIntoWindows(text, 80);
    expect(windows[1]!.startsWith('## B')).toBe(true);
  });

  it('never loses text', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    expect(splitIntoWindows(text, 37).join('\n').replace(/\s/g, '')).toBe(
      text.replace(/\s/g, ''),
    );
  });

  it('hard-cuts a document with no break in it', () => {
    expect(splitIntoWindows('z'.repeat(250), 100)).toHaveLength(3);
  });

  it('answers nothing for an empty document', () => {
    expect(splitIntoWindows(' \n ', 100)).toEqual([]);
  });

  it('refuses a non-positive window', () => {
    expect(() => splitIntoWindows('x', 0)).toThrow(RangeError);
  });
});
