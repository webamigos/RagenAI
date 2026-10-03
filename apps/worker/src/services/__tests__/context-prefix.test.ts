import { describe, expect, it } from 'vitest';

import { MAX_CONTEXT_PREFIX_CHARS } from '@ragenai/rag-core';

import {
  FREE_CONTEXT_PREFIX_VERSION,
  freeContextPrefix,
  titleOf,
  withFreeContextPrefix,
} from '../context-prefix.js';

describe('freeContextPrefix', () => {
  it('is the title, the section and the first sentence of the summary', () => {
    expect(
      freeContextPrefix({
        fileName: 'umowa-serwisowa_SLA.pdf',
        sectionPath: '4. Wynagrodzenie > 4.2 Terminy',
        summary:
          'Umowa określa warunki serwisu. Obejmuje czasy reakcji i kary.',
      }),
    ).toBe(
      'umowa serwisowa SLA — 4. Wynagrodzenie > 4.2 Terminy. Umowa określa warunki serwisu.',
    );
  });

  it('is the title alone without a section or a summary', () => {
    expect(freeContextPrefix({ fileName: 'Regulamin.docx' })).toBe('Regulamin');
  });

  // An organization with docSummariesEnabled off gets '' from
  // generateDocumentSummary, not undefined — the prefix must read it as none.
  it('reads an empty summary as no summary', () => {
    expect(freeContextPrefix({ fileName: 'Regulamin.docx', summary: '' })).toBe(
      'Regulamin',
    );
  });

  it('never exceeds the embedding contract’s cap', () => {
    const prefix = freeContextPrefix({
      fileName: 'a.pdf',
      sectionPath: 'x'.repeat(1_000),
      summary: 'y'.repeat(1_000),
    });
    expect(prefix.length).toBeLessThanOrEqual(MAX_CONTEXT_PREFIX_CHARS);
  });

  it('cuts a very long first sentence', () => {
    const prefix = freeContextPrefix({
      fileName: 'a.pdf',
      summary: `${'słowo '.repeat(80)}koniec.`,
    });
    expect(prefix.endsWith('…')).toBe(true);
  });
});

describe('titleOf', () => {
  it('drops the extension and the separators a file name uses for spaces', () => {
    expect(titleOf('raport_roczny-2025.xlsx')).toBe('raport roczny 2025');
    expect(titleOf('README')).toBe('README');
  });
});

describe('withFreeContextPrefix', () => {
  it('prefixes body chunks, leaves the summary chunk, and never touches the text', () => {
    const chunks = [
      { pageContent: 'Streszczenie.', metadata: { chunk_type: 'summary' } },
      {
        pageContent: 'Opłata 4%.',
        metadata: { sectionPath: '4. Wynagrodzenie' },
      },
      { pageContent: 'Bez sekcji.', metadata: {} },
    ];
    const out = withFreeContextPrefix(chunks, {
      fileName: 'umowa.pdf',
      summary: 'Umowa serwisowa.',
    });

    expect(out[0]).toBe(chunks[0]);
    expect(out[1]).toEqual({
      pageContent: 'Opłata 4%.',
      metadata: {
        sectionPath: '4. Wynagrodzenie',
        contextPrefix: 'umowa — 4. Wynagrodzenie. Umowa serwisowa.',
        contextVersion: FREE_CONTEXT_PREFIX_VERSION,
      },
    });
    expect(out[2]!.metadata.contextPrefix).toBe('umowa. Umowa serwisowa.');
    expect(out.map((c) => c.pageContent)).toEqual(
      chunks.map((c) => c.pageContent),
    );
  });
});
