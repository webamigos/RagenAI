import { describe, expect, it } from 'vitest';

import { EXTRACTION_LIMITS, parseExtraction } from '../schema';

const entity = (key: string) => ({
  key,
  title: `Title ${key}`,
  type: 'PROCESS',
  description: 'A description.',
});
const claim = (quote: string) => ({
  entityKey: 'e1',
  statement: 'A statement.',
  quote,
  locator: '§1',
});

describe('parseExtraction', () => {
  it('accepts a well-formed answer and rejects nothing', () => {
    const parsed = parseExtraction({
      entities: [entity('e1')],
      claims: [claim('a quote long enough')],
      relations: [{ from: 'e1', to: 'e1', kind: 'is', quote: null }],
    });
    expect(parsed).toMatchObject({ ok: true, rejectedItems: 0 });
  });

  // The shape is what earns a retry — the model answered something else.
  it.each([
    ['not an object', 'nope'],
    ['a missing array', { entities: [], claims: [] }],
    ['a wrong type', { entities: 'x', claims: [], relations: [] }],
    [
      'an unknown page type',
      {
        entities: [{ ...entity('e1'), type: 'THING' }],
        claims: [],
        relations: [],
      },
    ],
  ])('fails on %s', (_label, raw) => {
    expect(parseExtraction(raw).ok).toBe(false);
  });

  // One bad item must not cost the window.
  it('drops an item that breaks its limits and keeps the rest', () => {
    const parsed = parseExtraction({
      entities: [entity('e1'), { ...entity('e2'), title: '' }],
      claims: [
        claim('a quote long enough'),
        claim('short'),
        claim('x'.repeat(601)),
      ],
      relations: [],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.entities.map((e) => e.key)).toEqual(['e1']);
      expect(parsed.result.claims).toHaveLength(1);
      expect(parsed.rejectedItems).toBe(3);
    }
  });

  it('caps a window and counts what the cap removed', () => {
    const many = Array.from({ length: EXTRACTION_LIMITS.claims + 5 }, (_, i) =>
      claim(`a quote long enough ${i}`),
    );
    const parsed = parseExtraction({
      entities: [],
      claims: many,
      relations: [],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.claims).toHaveLength(EXTRACTION_LIMITS.claims);
      expect(parsed.rejectedItems).toBe(5);
    }
  });

  it('trims values the way the item schemas say', () => {
    const parsed = parseExtraction({
      entities: [{ ...entity('e1'), title: '  Padded  ' }],
      claims: [],
      relations: [],
    });
    expect(parsed.ok && parsed.result.entities[0]!.title).toBe('Padded');
  });
});
