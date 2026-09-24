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
    ['Straße', 'strasse'],
  ])('%j → %j', (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });

  // Assembly merges entities on the slug: two subjects must not meet.
  it('keeps titles in an untransliterated script apart', () => {
    const pay = slugify('Зарплата');
    const leave = slugify('Отпуск');
    expect(pay).not.toBe(leave);
    expect(pay).toMatch(/^page-[0-9a-f]{8}$/);
    // …while the same title still gives the same slug, across windows.
    expect(slugify(' зарплата ')).toBe(pay);
    expect(slugify('Zarplata 2024')).not.toBe(slugify('Зарплата 2024'));
    expect(slugify('Зарплата 2024')).toMatch(/^2024-[0-9a-f]{8}$/);
  });

  it('gives a slug the frontmatter accepts, in any script', () => {
    for (const title of [
      'Зарплата',
      'Λογαριασμός',
      '休假政策',
      'x'.repeat(100) + ' Отпуск',
    ]) {
      const slug = slugify(title);
      expect(slug.length).toBeLessThanOrEqual(80);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
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

  // Docling's markdown bolds figures; a model quoting the sentence does not.
  it('finds a quote across markdown emphasis', () => {
    const bold = new QuoteIndex(
      'The Board approved **"Cockatrice"** at **EUR 2 740 000** for 2026.',
    );
    expect(
      bold.contains(
        'The Board approved "Cockatrice" at EUR 2 740 000 for 2026.',
      ),
    ).toBe(true);
    expect(bold.contains('approved `Cockatrice`')).toBe(false);
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
    // Each of these fails every size comparison, and would send the whole
    // document as one window.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() => splitIntoWindows('x', bad)).toThrow(RangeError);
    }
  });
});
