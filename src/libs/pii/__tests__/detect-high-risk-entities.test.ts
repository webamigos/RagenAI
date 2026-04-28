import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnonymize = vi.fn();
vi.mock('../presidio-client', () => ({
  presidioClient: {
    anonymize: (...args: unknown[]) => mockAnonymize(...args),
  },
}));

import {
  detectHighRiskEntities,
  HIGH_RISK_ENTITY_TYPES,
} from '../detect-high-risk-entities';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectHighRiskEntities', () => {
  it('zwraca detected: false gdy Presidio nie wykryje PII', async () => {
    mockAnonymize.mockResolvedValueOnce({ maskedText: 'tekst', aliasMap: {} });

    const result = await detectHighRiskEntities('tekst bez PII');

    expect(result.detected).toBe(false);
    expect(result.entityTypes).toEqual([]);
  });

  it('zwraca detected: true gdy wykryto PL_PESEL', async () => {
    mockAnonymize.mockResolvedValueOnce({
      maskedText: '<PL_PESEL_1>',
      aliasMap: { '<PL_PESEL_1>': '93111111112' },
    });

    const result = await detectHighRiskEntities('pesel: 93111111112');

    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('PL_PESEL');
  });

  it('zwraca detected: true gdy wykryto CREDIT_CARD', async () => {
    mockAnonymize.mockResolvedValueOnce({
      maskedText: '<CREDIT_CARD_1>',
      aliasMap: { '<CREDIT_CARD_1>': '4111111111111111' },
    });

    const result = await detectHighRiskEntities('karta: 4111111111111111');

    expect(result.detected).toBe(true);
    expect(result.entityTypes).toContain('CREDIT_CARD');
  });

  it('ignoruje encje spoza listy high-risk (np. PERSON, EMAIL_ADDRESS)', async () => {
    mockAnonymize.mockResolvedValueOnce({
      maskedText: '<PERSON_1> <EMAIL_ADDRESS_1>',
      aliasMap: {
        '<PERSON_1>': 'Jan Kowalski',
        '<EMAIL_ADDRESS_1>': 'jan@firma.pl',
      },
    });

    const result = await detectHighRiskEntities('Jan Kowalski jan@firma.pl');

    expect(result.detected).toBe(false);
    expect(result.entityTypes).toEqual([]);
  });

  it('deduplikuje entity types gdy ten sam typ wystąpi wielokrotnie', async () => {
    mockAnonymize.mockResolvedValueOnce({
      maskedText: '<PL_PESEL_1> <PL_PESEL_2>',
      aliasMap: {
        '<PL_PESEL_1>': '93111111112',
        '<PL_PESEL_2>': '80010112345',
      },
    });

    const result = await detectHighRiskEntities(
      'pesele: 93111111112 80010112345',
    );

    expect(result.entityTypes).toEqual(['PL_PESEL']);
  });

  it('zwraca detected: false (fail-open) gdy Presidio jest niedostępny', async () => {
    mockAnonymize.mockRejectedValueOnce(
      new Error('Presidio analyzer unavailable'),
    );

    const result = await detectHighRiskEntities('tekst z PESEL-em');

    expect(result.detected).toBe(false);
    expect(result.entityTypes).toEqual([]);
  });

  it('HIGH_RISK_ENTITY_TYPES zawiera kluczowe typy', () => {
    expect(HIGH_RISK_ENTITY_TYPES.has('PL_PESEL')).toBe(true);
    expect(HIGH_RISK_ENTITY_TYPES.has('PL_IBAN')).toBe(true);
    expect(HIGH_RISK_ENTITY_TYPES.has('CREDIT_CARD')).toBe(true);
    expect(HIGH_RISK_ENTITY_TYPES.has('PL_ID_CARD')).toBe(true);
    expect(HIGH_RISK_ENTITY_TYPES.has('IBAN_CODE')).toBe(true);
  });
});
