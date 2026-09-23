import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { pageFrontmatterSchema } from '@ragenai/brain-contracts';
import { describe, expect, it } from 'vitest';

import { assembleCandidates, type ExtractionSource } from '../assemble';
import type { ExtractionResult } from '../schema';

const TEXT = readFileSync(
  join(import.meta.dirname, 'fixtures', 'regulamin-pracy.md'),
  'utf8',
);

const SOURCE: ExtractionSource = {
  organizationId: 'o1',
  fileId: '0b8e7a2c-1d3f-4e5a-9b6c-7d8e9f0a1b2c',
  documentVersionId: '1c9f8b3d-2e4a-4f6b-8c7d-8e9f0a1b2c3d',
  text: TEXT,
  principals: ['team:hr', 'user:u1'],
};

/** What a well-behaved model returns for the fixture — plus one invention. */
const WINDOW: ExtractionResult = {
  entities: [
    {
      key: 'e1',
      title: 'Wdrożenie nowego pracownika',
      type: 'PROCESS',
      description: 'Jak nowa osoba zaczyna pracę.',
    },
    {
      key: 'e2',
      title: 'Dział IT',
      type: 'ENTITY',
      description: 'Przygotowuje stanowiska.',
    },
    {
      key: 'e3',
      title: 'Premie kwartalne',
      type: 'POLICY',
      description: 'Wymyślone przez model.',
    },
  ],
  claims: [
    {
      entityKey: 'e1',
      statement: 'Dostęp do systemów jest nadawany pierwszego dnia.',
      // Line break in the source, single space here: still the same words.
      quote:
        'Nowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.',
      locator: '§2',
    },
    {
      entityKey: 'e2',
      statement: 'IT przygotowuje stanowisko.',
      quote: 'Za przygotowanie stanowiska odpowiada dział IT',
      locator: '§2',
    },
    {
      entityKey: 'e3',
      statement: 'Premie są wypłacane co kwartał.',
      quote: 'Premie wypłaca się na koniec każdego kwartału.',
      locator: '§7',
    },
    {
      entityKey: 'e1',
      // One word changed from the source — a paraphrase, not a quote.
      statement: 'Plan wdrożenia przygotowuje przełożony.',
      quote: 'za plan wdrożenia odpowiada bezpośredni przełożony',
      locator: '§2',
    },
  ],
  relations: [
    {
      from: 'e2',
      to: 'e1',
      kind: 'uczestniczy w',
      quote: 'Za przygotowanie stanowiska odpowiada dział IT',
    },
    { from: 'e1', to: 'e2', kind: 'wymaga', quote: null },
    {
      from: 'e1',
      to: 'e2',
      kind: 'jest nadzorowane przez',
      quote: 'Dział IT nadzoruje cały proces wdrożenia.',
    },
    { from: 'e1', to: 'e3', kind: 'wpływa na', quote: null },
  ],
};

describe('assembleCandidates', () => {
  const result = assembleCandidates(SOURCE, [WINDOW]);
  const bySlug = new Map(result.pages.map((p) => [p.slug, p]));

  it('keeps a claim whose quote is in the source, across a line break', () => {
    const page = bySlug.get('wdrozenie-nowego-pracownika');
    expect(page?.sources.map((s) => s.span)).toEqual(['§2']);
  });

  it('drops a claim whose quote is not in the source — invented or paraphrased', () => {
    expect(result.unverifiedClaims).toBe(2);
    expect(bySlug.get('wdrozenie-nowego-pracownika')!.content).not.toContain(
      'Plan wdrożenia',
    );
  });

  it('does not make a page of an entity with nothing verified behind it', () => {
    expect(bySlug.has('premie-kwartalne')).toBe(false);
  });

  it('earns each edge its origin', () => {
    const origins = Object.fromEntries(
      result.edges.map((e) => [e.kind, e.origin]),
    );
    expect(origins).toEqual({
      'uczestniczy w': 'EXTRACTED',
      wymaga: 'INFERRED',
      'jest nadzorowane przez': 'AMBIGUOUS',
    });
  });

  it('drops an edge to a page that was not made', () => {
    expect(result.edges.some((e) => e.toSlug === 'premie-kwartalne')).toBe(
      false,
    );
  });

  it('pins every source to the version and file extracted', () => {
    for (const page of result.pages) {
      for (const source of page.sources) {
        expect(source).toMatchObject({
          fileId: SOURCE.fileId,
          documentVersionId: SOURCE.documentVersionId,
        });
      }
    }
  });

  // D7: the source's own principals, never wider. Through the same function
  // the multi-document merge will use.
  it('gives a page its source principals', () => {
    for (const page of result.pages) {
      expect(page.accessibleBy).toEqual(['team:hr', 'user:u1']);
    }
  });

  it('shows each statement beside the words behind it', () => {
    const content = bySlug.get('wdrozenie-nowego-pracownika')!.content;
    expect(content).toContain(
      '- Dostęp do systemów jest nadawany pierwszego dnia. [1]',
    );
    expect(content).toContain(
      '1. (§2) „Nowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.”',
    );
  });

  // The candidate must be exportable once a person approves it and names an
  // owner — the frontmatter is the contract it will be checked against.
  it('produces pages the bundle contract accepts once approved and owned', () => {
    for (const page of result.pages) {
      const parsed = pageFrontmatterSchema.safeParse({
        id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
        slug: page.slug,
        title: page.title,
        type: page.type,
        status: 'APPROVED',
        owner: 'u1',
        accessibleBy: page.accessibleBy,
        contentHash: page.contentHash,
        sources: page.sources,
      });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it('merges one entity seen in two windows into one page', () => {
    const second: ExtractionResult = {
      entities: [
        {
          key: 'x9',
          title: 'Wdrożenie nowego pracownika',
          type: 'PROCESS',
          description: 'Inny opis.',
        },
      ],
      claims: [
        {
          entityKey: 'x9',
          statement: 'Wniosek zatwierdza przełożony.',
          quote: 'Wniosek zatwierdza bezpośredni przełożony.',
          locator: '§4',
        },
        {
          entityKey: 'x9',
          statement: 'Duplikat.',
          quote:
            'Nowy pracownik otrzymuje dostęp do systemów w pierwszym dniu pracy.',
          locator: '§2',
        },
      ],
      relations: [],
    };
    const merged = assembleCandidates(SOURCE, [WINDOW, second]);
    const pages = merged.pages.filter(
      (p) => p.slug === 'wdrozenie-nowego-pracownika',
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]!.sources.map((s) => s.span)).toEqual(['§2', '§4']);
    expect(pages[0]!.content).toContain('Jak nowa osoba zaczyna pracę.');
  });

  it('gives a source with no locator a visible placeholder, never an empty span', () => {
    const window: ExtractionResult = {
      entities: [
        { key: 'a', title: 'Urlopy', type: 'POLICY', description: 'd' },
      ],
      claims: [
        {
          entityKey: 'a',
          statement: 's',
          quote: 'Wniosek zatwierdza bezpośredni przełożony.',
          locator: '',
        },
      ],
      relations: [],
    };
    const [page] = assembleCandidates(SOURCE, [window]).pages;
    expect(page!.sources[0]!.span).toBe('—');
  });

  it('answers nobody for a file whose principals were never written', () => {
    const [page] = assembleCandidates({ ...SOURCE, principals: [] }, [
      WINDOW,
    ]).pages;
    expect(page!.accessibleBy).toEqual([]);
  });
});
