import { describe, expect, it } from 'vitest';

import { splitMarkdownDocuments } from '../markdown-text-splitter.js';
import { attachSectionPaths, headingsOf } from '../section-paths.js';

const chunk = (
  pageContent: string,
  metadata: Record<string, unknown> = {},
) => ({
  pageContent,
  metadata,
});

describe('headingsOf', () => {
  it('reads ATX headings with their level and offset', () => {
    const md = '# Umowa\n\nWstęp.\n\n## 4. Wynagrodzenie ##\n';
    expect(headingsOf(md)).toEqual([
      { offset: 0, level: 1, text: 'Umowa' },
      { offset: md.indexOf('## 4.'), level: 2, text: '4. Wynagrodzenie' },
    ]);
  });

  it('ignores a # inside a code fence, and a hash with no space', () => {
    const md = '```\n# not a heading\n```\n#hashtag\n## Real\n';
    expect(headingsOf(md).map((h) => h.text)).toEqual(['Real']);
  });
});

describe('attachSectionPaths', () => {
  const md = [
    '# Umowa serwisowa',
    '',
    'Strony umowy.',
    '',
    '## 4. Wynagrodzenie',
    '',
    'Opłata wynosi 4% wartości umowy.',
    '',
    '### 4.2 Terminy',
    '',
    'Faktura płatna w 14 dni.',
    '',
    '## 5. Rozwiązanie',
    '',
    'Z trzydziestodniowym wypowiedzeniem.',
  ].join('\n');

  it('files each chunk under the headings in force where it starts', () => {
    const out = attachSectionPaths(
      [
        chunk('Strony umowy.'),
        chunk('Opłata wynosi 4% wartości umowy.'),
        chunk('### 4.2 Terminy\n\nFaktura płatna w 14 dni.'),
        chunk('Z trzydziestodniowym wypowiedzeniem.'),
      ],
      md,
    );
    expect(out.map((c) => c.metadata.sectionPath)).toEqual([
      'Umowa serwisowa',
      'Umowa serwisowa > 4. Wynagrodzenie',
      // Opens on the heading, so it is under it.
      'Umowa serwisowa > 4. Wynagrodzenie > 4.2 Terminy',
      // A new level-2 heading ends 4.2.
      'Umowa serwisowa > 5. Rozwiązanie',
    ]);
  });

  it('keeps a path a chunk already has, such as a table chunk', () => {
    const [out] = attachSectionPaths(
      [chunk('Opłata wynosi 4% wartości umowy.', { sectionPath: 'Tabela 1' })],
      md,
    );
    expect(out!.metadata.sectionPath).toBe('Tabela 1');
  });

  it('gives no path to a chunk it cannot locate, or to text before any heading', () => {
    const out = attachSectionPaths(
      [chunk('Przedmowa.'), chunk('Tekst, którego nie ma w dokumencie.')],
      'Przedmowa.\n\n# Rozdział\n\nTreść.',
    );
    expect(out.map((c) => c.metadata.sectionPath)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('leaves a document without headings as it was', () => {
    const chunks = [chunk('Sam tekst.')];
    expect(attachSectionPaths(chunks, 'Sam tekst.')).toBe(chunks);
  });

  it('works on the Markdown splitter’s own output, overlap included', () => {
    const long = [
      '# Regulamin',
      '',
      '## Urlopy',
      '',
      'Pracownikowi przysługuje urlop. '.repeat(20).trim(),
      '',
      '## Nadgodziny',
      '',
      'Nadgodziny rozlicza się miesięcznie. '.repeat(20).trim(),
    ].join('\n');
    const chunks = splitMarkdownDocuments([chunk(long)], {
      chunkSize: 300,
      chunkOverlap: 60,
      keepSeparator: true,
    });
    const paths = attachSectionPaths(chunks, long).map(
      (c) => c.metadata.sectionPath,
    );

    expect(chunks.length).toBeGreaterThan(2);
    expect(paths.every((p) => typeof p === 'string')).toBe(true);
    expect(paths[0]).toMatch(/^Regulamin/);
    expect(paths.at(-1)).toBe('Regulamin > Nadgodziny');
  });
});
