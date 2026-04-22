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

describe('presidioClient.anonymize', () => {
  it('zwraca maskedText i pustą aliasMap gdy Presidio nie wykryje PII', async () => {
    const client = await getClient();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await client.anonymize('brak PII tutaj', 'pl');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.maskedText).toBe('brak PII tutaj');
    expect(result.aliasMap).toEqual({});
  });

  it('zwraca zamaskowany tekst i mapę aliasów gdy wykryto PII', async () => {
    const client = await getClient();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { entity_type: 'PL_NIP', start: 10, end: 20, score: 0.9 },
      ],
    });

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

  it('buduje poprawne placeholdery dla wielu wystąpień tego samego entity_type', async () => {
    const client = await getClient();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { entity_type: 'PL_NIP', start: 5, end: 15, score: 0.9 },
        { entity_type: 'PL_NIP', start: 23, end: 33, score: 0.9 },
      ],
    });

    const result = await client.anonymize(
      'nip: 1111111111 i nip: 2222222222 koniec',
      'pl',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.aliasMap['<PL_NIP_1>']).toBe('1111111111');
    expect(result.aliasMap['<PL_NIP_2>']).toBe('2222222222');
    expect(result.maskedText).toContain('<PL_NIP_1>');
    expect(result.maskedText).toContain('<PL_NIP_2>');
  });
});
