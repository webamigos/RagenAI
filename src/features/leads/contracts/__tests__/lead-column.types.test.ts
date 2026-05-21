import { describe, it, expect } from 'vitest';
import {
  LeadColumnTypeSchema,
  LeadColumnSourceSchema,
  LeadColumnSchema,
  LeadColumnsSchema,
} from '../lead-column.types';

describe('LeadColumnTypeSchema', () => {
  it.each(['string', 'number', 'boolean', 'date', 'url'])(
    'accepts valid type "%s"',
    (type) => {
      expect(LeadColumnTypeSchema.safeParse(type).success).toBe(true);
    },
  );

  it.each(['text', 'integer', 'object', '', 123])(
    'rejects invalid type "%s"',
    (type) => {
      expect(LeadColumnTypeSchema.safeParse(type).success).toBe(false);
    },
  );
});

describe('LeadColumnSourceSchema', () => {
  it.each(['csv', 'enrichment'])('accepts valid source "%s"', (source) => {
    expect(LeadColumnSourceSchema.safeParse(source).success).toBe(true);
  });

  it.each(['raw', 'import', '', 0])('rejects invalid source "%s"', (source) => {
    expect(LeadColumnSourceSchema.safeParse(source).success).toBe(false);
  });
});

const validColumn = {
  key: 'company',
  label: 'Company',
  type: 'string',
  source: 'csv',
};

describe('LeadColumnSchema', () => {
  it('parses a valid column object', () => {
    const result = LeadColumnSchema.safeParse(validColumn);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validColumn);
    }
  });

  it('rejects missing key', () => {
    const { key: _k, ...rest } = validColumn;
    expect(LeadColumnSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing label', () => {
    const { label: _l, ...rest } = validColumn;
    expect(LeadColumnSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing type', () => {
    const { type: _t, ...rest } = validColumn;
    expect(LeadColumnSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing source', () => {
    const { source: _s, ...rest } = validColumn;
    expect(LeadColumnSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects type outside enum', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, type: 'text' }).success,
    ).toBe(false);
  });

  it('rejects source outside enum', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, source: 'import' }).success,
    ).toBe(false);
  });

  it('rejects key shorter than 1', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, key: '' }).success,
    ).toBe(false);
  });

  it('rejects key longer than 120', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, key: 'a'.repeat(121) })
        .success,
    ).toBe(false);
  });

  it('accepts key of exactly 120 characters', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, key: 'a'.repeat(120) })
        .success,
    ).toBe(true);
  });

  it('rejects label shorter than 1', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, label: '' }).success,
    ).toBe(false);
  });

  it('rejects label longer than 200', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, label: 'a'.repeat(201) })
        .success,
    ).toBe(false);
  });

  it('accepts label of exactly 200 characters', () => {
    expect(
      LeadColumnSchema.safeParse({ ...validColumn, label: 'a'.repeat(200) })
        .success,
    ).toBe(true);
  });
});

describe('LeadColumnsSchema', () => {
  it('accepts an array of valid columns', () => {
    const cols = [
      validColumn,
      {
        key: '_enrichment_nip',
        label: 'NIP',
        type: 'string',
        source: 'enrichment',
      },
    ];
    expect(LeadColumnsSchema.safeParse(cols).success).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(LeadColumnsSchema.safeParse([]).success).toBe(true);
  });

  it('rejects when any item has an invalid type', () => {
    const cols = [validColumn, { ...validColumn, type: 'blob' }];
    expect(LeadColumnsSchema.safeParse(cols).success).toBe(false);
  });

  it('rejects when any item is missing a field', () => {
    const { label: _l, ...incomplete } = validColumn;
    expect(LeadColumnsSchema.safeParse([validColumn, incomplete]).success).toBe(
      false,
    );
  });

  it('rejects a non-array input', () => {
    expect(LeadColumnsSchema.safeParse(validColumn).success).toBe(false);
  });
});
