import { describe, it, expect } from 'vitest';
import { detectLookup } from '../detect-lookup';

describe('detectLookup', () => {
  it('prefers NIP when a 10-digit value is present', () => {
    expect(detectLookup({ nip: '1234567890', company: 'Acme' })).toEqual({
      nip: '1234567890',
    });
  });

  it('strips spaces and dashes from NIP', () => {
    expect(detectLookup({ NIP: '123-456-78-90' })).toEqual({
      nip: '1234567890',
    });
  });

  it('ignores _enrichment_ columns', () => {
    expect(
      detectLookup({
        _enrichment_nip: '1234567890',
        company: 'Acme',
      }),
    ).toEqual({ name: 'Acme' });
  });

  it('falls back to KRS when present and NIP is absent', () => {
    expect(detectLookup({ krs: '0000123456' })).toEqual({ krs: '0000123456' });
  });

  it('rejects KRS shorter than 10 digits and falls back to other fields', () => {
    expect(detectLookup({ krs: '123456', company: 'Acme' })).toEqual({
      name: 'Acme',
    });
  });

  it('rejects KRS longer than 10 digits and falls back to other fields', () => {
    expect(detectLookup({ krs: '00001234567', company: 'Acme' })).toEqual({
      name: 'Acme',
    });
  });

  it('falls back to a company-like column when no IDs are present', () => {
    expect(detectLookup({ Firma: 'Acme Sp. z o.o.', Country: 'PL' })).toEqual({
      name: 'Acme',
    });
  });

  it('strips "Sp. Z O.O." suffix (mixed case)', () => {
    expect(detectLookup({ company: 'iGamingNuts Sp. Z O.O.' })).toEqual({
      name: 'iGamingNuts',
    });
  });

  it('strips "S.A." suffix', () => {
    expect(detectLookup({ company: 'PKN Orlen S.A.' })).toEqual({
      name: 'PKN Orlen',
    });
  });

  it('strips "Spółka z o.o." suffix', () => {
    expect(detectLookup({ company: 'Symfonia Spółka z o.o.' })).toEqual({
      name: 'Symfonia',
    });
  });

  it('leaves names without legal suffix unchanged', () => {
    expect(detectLookup({ company: 'WebAmigos' })).toEqual({
      name: 'WebAmigos',
    });
  });

  it('returns null when nothing usable is found', () => {
    expect(detectLookup({ country: 'PL', industry: 'Tech' })).toBeNull();
  });

  it('skips empty string values', () => {
    expect(detectLookup({ nip: '', company: 'Acme' })).toEqual({
      name: 'Acme',
    });
  });

  it('rejects a 9- or 11-digit NIP and falls back to other fields', () => {
    expect(detectLookup({ nip: '123456789', company: 'Acme' })).toEqual({
      name: 'Acme',
    });
    expect(detectLookup({ nip: '12345678901', company: 'Acme' })).toEqual({
      name: 'Acme',
    });
  });

  it('prefers exact-match nip column over substring matches', () => {
    expect(
      detectLookup({ supplier_nip: '1111111111', nip: '2222222222' }),
    ).toEqual({
      nip: '2222222222',
    });
  });

  it('returns null when only _enrichment_ keys are populated', () => {
    expect(
      detectLookup({
        _enrichment_nip: '1234567890',
        _enrichment_nazwa_pelna: 'X',
      }),
    ).toBeNull();
  });

  it('ignores non-string values', () => {
    expect(
      detectLookup({ nip: 1234567890 as unknown as string, company: 'Acme' }),
    ).toEqual({
      name: 'Acme',
    });
  });
});
