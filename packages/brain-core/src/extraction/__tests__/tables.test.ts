import { describe, expect, it } from 'vitest';

import { assembleCandidates, type ExtractionSource } from '../assemble';
import type { ExtractionResult } from '../schema';
import { findTables, tableRows } from '../tables';

const PRICE_LIST = `# Zakłady „Czarny Dunajec" sp. z o.o.

## Cennik usług serwisowych

Stawki obowiązują od 1 kwietnia 2026 r. Stawka podstawowa dotyczy dni roboczych.

| Kod | Usługa | Stawka (zł/h) |
| --- | --- | --- |
| SR-201 | Toczenie CNC | 121,05 |
| SR-204 | Frezowanie CNC | 127,92 |
| SR-207 | Spawanie TIG | 292,71 |

Do każdej usługi poza godzinami dolicza się ryczałt dojazdowy 87,40 zł.
`;

const SOURCE: ExtractionSource = {
  organizationId: 'o1',
  fileId: '0b8e7a2c-1d3f-4e5a-9b6c-7d8e9f0a1b2c',
  documentVersionId: '1c9f8b3d-2e4a-4f6b-8c7d-8e9f0a1b2c3d',
  text: PRICE_LIST,
  principals: ['org:o1'],
};

const ROWS = [
  ['SR-201', 'Toczenie CNC', '| SR-201 | Toczenie CNC | 121,05 |'],
  ['SR-204', 'Frezowanie CNC', '| SR-204 | Frezowanie CNC | 127,92 |'],
  ['SR-207', 'Spawanie TIG', '| SR-207 | Spawanie TIG | 292,71 |'],
] as const;

/** The failure itself: every row its own entity, joined by guesses. */
function rowPerEntity(extra: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    entities: [
      ...ROWS.map(([key, title]) => ({
        key,
        title,
        type: 'PRODUCT' as const,
        description: `Usługa ${title}.`,
      })),
      ...(extra.entities ?? []),
    ],
    claims: [
      ...ROWS.map(([key, title, row]) => ({
        entityKey: key,
        statement: `${title} kosztuje tyle, ile podaje cennik.`,
        quote: row,
        locator: '',
      })),
      ...(extra.claims ?? []),
    ],
    relations: [
      { from: 'SR-201', to: 'SR-204', kind: 'jest obok', quote: null },
      ...(extra.relations ?? []),
    ],
  };
}

describe('findTables', () => {
  it('finds a table with the heading above it and its first sentence of prose', () => {
    const [table, ...rest] = findTables(PRICE_LIST);
    expect(rest).toEqual([]);
    expect(table!.heading).toBe('Cennik usług serwisowych');
    // Verbatim, and not cut at the abbreviation "r.".
    expect(table!.lead).toBe(
      'Stawki obowiązują od 1 kwietnia 2026 r. Stawka podstawowa dotyczy dni roboczych.',
    );
    expect(PRICE_LIST.slice(table!.start, table!.end)).toMatch(
      /^\| Kod[\s\S]*292,71 \|$/,
    );
  });

  it('finds none in prose', () => {
    expect(findTables('Tekst bez tabel.\n\nI drugi akapit.')).toEqual([]);
  });

  it('finds a table with no heading, and says so', () => {
    const [table] = findTables('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    expect(table).toMatchObject({ heading: null, lead: null });
  });
});

describe('assembleCandidates, a table split into rows', () => {
  it('folds row-entities into one page named by the heading', () => {
    const assembled = assembleCandidates(SOURCE, [rowPerEntity()]);
    expect(assembled.pages).toHaveLength(1);
    const [page] = assembled.pages;
    expect(page).toMatchObject({
      title: 'Cennik usług serwisowych',
      slug: 'cennik-uslug-serwisowych',
      type: 'PRODUCT',
    });
    expect(page!.sources.map((s) => s.quote)).toEqual(ROWS.map((r) => r[2]));
    // The description is the document's own sentence, in its language.
    expect(page!.content).toContain('Stawki obowiązują od 1 kwietnia 2026 r.');
    expect(assembled.foldedTableRows).toBe(3);
    // The guessed edge between two rows is now a loop, and goes.
    expect(assembled.edges).toEqual([]);
  });

  it('folds rows into the entity the model made from the heading’s prose', () => {
    const assembled = assembleCandidates(SOURCE, [
      rowPerEntity({
        entities: [
          {
            key: 'list',
            title: 'Cennik usług serwisowych',
            type: 'POLICY',
            description: 'Cennik usług dla podmiotów zewnętrznych.',
          },
        ],
        claims: [
          {
            entityKey: 'list',
            statement: 'Ryczałt dojazdowy wynosi 87,40 zł.',
            quote:
              'Do każdej usługi poza godzinami dolicza się ryczałt dojazdowy 87,40 zł.',
            locator: '',
          },
        ],
      }),
    ]);
    expect(assembled.pages).toHaveLength(1);
    expect(assembled.pages[0]).toMatchObject({ type: 'POLICY' });
    expect(assembled.pages[0]!.content).toContain(
      'Cennik usług dla podmiotów zewnętrznych.',
    );
    // Rows before the prose after them: source order.
    expect(assembled.pages[0]!.sources).toHaveLength(4);
    expect(assembled.pages[0]!.sources[3]!.quote).toMatch(/^Do każdej/);
  });

  it('keeps the table entity the model got right and absorbs a stray row', () => {
    const window: ExtractionResult = {
      entities: [
        { key: 't', title: 'Stawki', type: 'PRODUCT', description: 'Stawki.' },
        {
          key: 'r',
          title: 'Spawanie TIG',
          type: 'PRODUCT',
          description: 'TIG.',
        },
      ],
      claims: [
        { entityKey: 't', statement: 'a', quote: ROWS[0][2], locator: '' },
        { entityKey: 't', statement: 'b', quote: ROWS[1][2], locator: '' },
        { entityKey: 'r', statement: 'c', quote: ROWS[2][2], locator: '' },
      ],
      relations: [{ from: 'r', to: 't', kind: 'należy do', quote: null }],
    };
    const assembled = assembleCandidates(SOURCE, [window]);
    expect(assembled.pages.map((p) => p.title)).toEqual(['Stawki']);
    expect(assembled.pages[0]!.sources).toHaveLength(3);
    expect(assembled.foldedTableRows).toBe(1);
  });

  // The prompt's exception: a row whose subject the prose also describes.
  it('leaves an entity alone when it has a claim outside the table', () => {
    const window = rowPerEntity({
      claims: [
        {
          entityKey: 'SR-201',
          statement: 'Toczenie ma ryczałt.',
          quote:
            'Do każdej usługi poza godzinami dolicza się ryczałt dojazdowy 87,40 zł.',
          locator: '',
        },
      ],
      relations: [
        { from: 'SR-207', to: 'SR-201', kind: 'jest obok', quote: null },
      ],
    });
    const assembled = assembleCandidates(SOURCE, [window]);
    expect(assembled.pages.map((p) => p.title).sort()).toEqual([
      'Cennik usług serwisowych',
      'Toczenie CNC',
    ]);
    expect(assembled.foldedTableRows).toBe(2);
    // Edges to folded rows now point at the table's page.
    expect(assembled.edges).toEqual([
      expect.objectContaining({
        fromSlug: 'toczenie-cnc',
        toSlug: 'cennik-uslug-serwisowych',
      }),
      expect.objectContaining({
        fromSlug: 'cennik-uslug-serwisowych',
        toSlug: 'toczenie-cnc',
      }),
    ]);
  });

  it('does not fold a single entity that lives in a table', () => {
    const window: ExtractionResult = {
      entities: [
        { key: 't', title: 'Stawki', type: 'PRODUCT', description: 'Stawki.' },
      ],
      claims: [
        { entityKey: 't', statement: 'a', quote: ROWS[0][2], locator: '' },
      ],
      relations: [],
    };
    const assembled = assembleCandidates(SOURCE, [window]);
    expect(assembled.pages.map((p) => p.title)).toEqual(['Stawki']);
    expect(assembled.foldedTableRows).toBe(0);
  });

  // The second half of the failure: a model that splits a table stops early.
  it('adds the rows a folded table lost, from the table itself', () => {
    const window = rowPerEntity();
    window.entities = window.entities.slice(0, 2);
    window.claims = window.claims.slice(0, 2);
    const assembled = assembleCandidates(SOURCE, [window]);
    expect(assembled.completedTableRows).toBe(1);
    const [page] = assembled.pages;
    expect(page!.sources.map((s) => s.quote)).toEqual(ROWS.map((r) => r[2]));
    expect(page!.content).toContain(
      '- Kod: SR-207; Usługa: Spawanie TIG; Stawka (zł/h): 292,71',
    );
  });

  it('adds nothing to a table the model did not split', () => {
    const window: ExtractionResult = {
      entities: [
        { key: 't', title: 'Stawki', type: 'PRODUCT', description: 'Stawki.' },
      ],
      claims: [
        { entityKey: 't', statement: 'a', quote: ROWS[0][2], locator: '' },
      ],
      relations: [],
    };
    const assembled = assembleCandidates(SOURCE, [window]);
    expect(assembled.completedTableRows).toBe(0);
    expect(assembled.pages[0]!.sources).toHaveLength(1);
  });
});

describe('tableRows', () => {
  it('reads data rows with their cells under the column names', () => {
    const [table] = findTables(PRICE_LIST);
    const rows = tableRows(PRICE_LIST, table!);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      text: '| SR-201 | Toczenie CNC | 121,05 |',
      statement: 'Kod: SR-201; Usługa: Toczenie CNC; Stawka (zł/h): 121,05',
    });
    expect(PRICE_LIST.slice(rows[0]!.at, rows[0]!.end)).toBe(rows[0]!.text);
  });

  it('reads nothing from a block with no header separator', () => {
    const text = '| a | b |\n| 1 | 2 |\n';
    expect(tableRows(text, findTables(text)[0]!)).toEqual([]);
  });
});
