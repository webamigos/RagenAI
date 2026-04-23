import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.PRESIDIO_ANALYZER_URL = 'http://localhost:5002';
});

const getClient = async () => {
  vi.resetModules();
  const { presidioClient } = await import('../presidio-client');
  return presidioClient;
};

const analyzerOk = (results: unknown[]) => ({
  ok: true,
  json: async () => results,
});

describe('presidioClient.anonymize', () => {
  it('zwraca maskedText i pustą aliasMap gdy Presidio nie wykryje PII', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce(analyzerOk([]));

    const result = await client.anonymize('brak PII tutaj', 'pl');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.maskedText).toBe('brak PII tutaj');
    expect(result.aliasMap).toEqual({});
  });

  it('zwraca zamaskowany tekst i mapę aliasów gdy wykryto PII', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce(
      analyzerOk([{ entity_type: 'PL_NIP', start: 10, end: 20, score: 0.9 }]),
    );

    const result = await client.anonymize(
      'numer nip 1234567890 w dokumencie',
      'pl',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.maskedText).toBe('numer nip <PL_NIP_1> w dokumencie');
    expect(result.aliasMap['<PL_NIP_1>']).toBe('1234567890');
  });

  it('rzuca błąd gdy Presidio analyzer niedostępny (fail-closed)', async () => {
    const client = await getClient();
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      client.anonymize('tekst z NIP 1234567890', 'pl'),
    ).rejects.toThrow('Presidio analyzer unavailable');
  });

  it('rzuca błąd gdy Presidio analyzer zwraca non-200', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(
      client.anonymize('tekst z NIP 1234567890', 'pl'),
    ).rejects.toThrow('Presidio analyzer unavailable');
  });

  it('maskuje PL_PESEL gdy Presidio go wykryje (walidacja checksum po stronie Presidio Python)', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce(
      analyzerOk([
        { entity_type: 'PL_PESEL', start: 14, end: 25, score: 0.75 },
      ]),
    );

    const result = await client.anonymize('Mój pesel to: 93111111112', 'pl');

    expect(result.maskedText).toBe('Mój pesel to: <PL_PESEL_1>');
    expect(result.aliasMap['<PL_PESEL_1>']).toBe('93111111112');
  });

  it('usuwa nakładające się spany — zachowuje wynik z wyższym score', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce(
      analyzerOk([
        { entity_type: 'PL_NIP', start: 10, end: 20, score: 0.5 },
        { entity_type: 'PHONE_NUMBER', start: 10, end: 20, score: 0.4 },
        { entity_type: 'PL_PHONE', start: 10, end: 19, score: 0.4 },
      ]),
    );

    const result = await client.anonymize('numer nip 1234567890 koniec', 'pl');

    expect(result.maskedText).toBe('numer nip <PL_NIP_1> koniec');
    expect(Object.keys(result.aliasMap)).toHaveLength(1);
    expect(result.aliasMap['<PL_NIP_1>']).toBe('1234567890');
  });

  it('przy remisie score preferuje encję o wyższym priorytecie (PL_PHONE > PL_REGON)', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce(
      analyzerOk([
        { entity_type: 'PL_REGON', start: 10, end: 19, score: 0.45 },
        { entity_type: 'PL_PHONE', start: 10, end: 19, score: 0.45 },
      ]),
    );

    const result = await client.anonymize('telefon: 123456789 koniec', 'pl');

    expect(Object.keys(result.aliasMap)).toHaveLength(1);
    expect(Object.keys(result.aliasMap)[0]).toContain('PL_PHONE');
  });

  it('buduje poprawne placeholdery dla wielu wystąpień tego samego entity_type', async () => {
    const client = await getClient();
    mockFetch.mockResolvedValueOnce(
      analyzerOk([
        { entity_type: 'PL_NIP', start: 5, end: 15, score: 0.9 },
        { entity_type: 'PL_NIP', start: 23, end: 33, score: 0.9 },
      ]),
    );

    const result = await client.anonymize(
      'nip: 1111111111 i nip: 2222222222 koniec',
      'pl',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.aliasMap['<PL_NIP_1>']).toBe('1111111111');
    expect(result.aliasMap['<PL_NIP_2>']).toBe('2222222222');
    expect(result.maskedText).toBe('nip: <PL_NIP_1> i nip: <PL_NIP_2> koniec');
  });
});
