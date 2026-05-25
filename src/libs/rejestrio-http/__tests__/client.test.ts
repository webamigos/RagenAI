import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { RejestrioHttpClient, __testing } = await import('../client');
const { buildCustomerId, payloadToColumnFields } = await import('../mapper');

const SECRET = 'x'.repeat(40);

function refSign(
  timestamp: string,
  method: string,
  path: string,
  body: string,
) {
  return createHmac('sha256', SECRET)
    .update(`${timestamp}.${method.toUpperCase()}.${path}.${body}`)
    .digest('hex');
}

describe('signRequest', () => {
  it('produces a stable HMAC matching the service-side formula', () => {
    const ts = '1700000000000';
    const sig = __testing.signRequest(
      SECRET,
      ts,
      'POST',
      '/enrich/company',
      '{"a":1}',
    );
    expect(sig).toBe(refSign(ts, 'POST', '/enrich/company', '{"a":1}'));
  });

  it('changes when body changes', () => {
    const a = __testing.signRequest(SECRET, '1', 'POST', '/x', 'a');
    const b = __testing.signRequest(SECRET, '1', 'POST', '/x', 'b');
    expect(a).not.toBe(b);
  });
});

describe('RejestrioHttpClient.enrichCompany', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('signs the request body and timestamp the way the server expects', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new RejestrioHttpClient('http://x', SECRET);
    await client.enrichCompany({ customerId: 'c', nip: '1234567890' });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    const sentBody = init?.body as string;
    const expected = refSign(
      headers['x-timestamp'],
      'POST',
      '/enrich/company',
      sentBody,
    );
    expect(headers['x-signature']).toBe(expected);
  });

  it('sends signed POST and returns success payload', async () => {
    const data = {
      success: true,
      matched: { source: 'krs' },
      data: {
        krs: '0000123456',
        nip: null,
        regon: null,
        nazwaPelna: 'Acme',
        nazwaSkrocona: null,
        formaPrawna: null,
        pkdGlowny: null,
        miejscowosc: null,
        kodPocztowy: null,
        wykreslona: false,
        wUpadlosci: false,
        wLikwidacji: false,
        przychodyPln: null,
        zyskPln: null,
        aktywaPln: null,
        sprawozdanieRocznik: null,
      },
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RejestrioHttpClient('http://localhost:9100/', SECRET);
    const res = await client.enrichCompany({
      customerId: 'org:user:rejestrio',
      krs: '0000123456',
    });

    expect(res.success).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:9100/enrich/company');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-timestamp']).toMatch(/^\d+$/);
    expect(headers['x-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps 404 to not_found with fallback error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));
    const client = new RejestrioHttpClient('http://x', SECRET);
    const res = await client.enrichCompany({
      customerId: 'c',
      nip: '1234567890',
    });
    expect(res).toEqual({
      success: false,
      error: 'not_found',
      code: 'not_found',
    });
  });

  it('maps 404 with JSON body to not_found preserving upstream error message', async () => {
    const body = JSON.stringify({
      success: false,
      error: 'No matching company found',
      code: 'not_found',
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(body, {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new RejestrioHttpClient('http://x', SECRET);
    const res = await client.enrichCompany({ customerId: 'c', name: 'ArogAI' });
    expect(res).toEqual({
      success: false,
      error: 'No matching company found',
      code: 'not_found',
    });
  });

  it('maps 502 with JSON body to upstream preserving error message', async () => {
    const body = JSON.stringify({
      success: false,
      error: 'Daily Rejestr.io budget exceeded for org abc: 20.00/20.00 PLN',
      code: 'upstream',
    });
    // The client retries once on `code: 'upstream'`, so fetch is called
    // twice. Return a fresh Response per call — Response bodies are
    // single-use streams and reading them again would yield empty text.
    fetchSpy.mockImplementation(
      async () =>
        new Response(body, {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = new RejestrioHttpClient('http://x', SECRET);
    const res = await client.enrichCompany({ customerId: 'c', name: 'Test' });
    expect(res).toEqual({
      success: false,
      error: 'Daily Rejestr.io budget exceeded for org abc: 20.00/20.00 PLN',
      code: 'upstream',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('maps 400 to invalid with body text', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('bad input', { status: 400 }));
    const client = new RejestrioHttpClient('http://x', SECRET);
    const res = await client.enrichCompany({
      customerId: 'c',
      nip: '1234567890',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe('invalid');
      expect(res.error).toBe('bad input');
    }
  });

  it('maps 5xx to upstream', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const client = new RejestrioHttpClient('http://x', SECRET);
    const res = await client.enrichCompany({
      customerId: 'c',
      nip: '1234567890',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe('upstream');
    }
  });

  it('maps network errors to upstream', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('econn refused'));
    const client = new RejestrioHttpClient('http://x', SECRET);
    const res = await client.enrichCompany({
      customerId: 'c',
      nip: '1234567890',
    });
    expect(res).toEqual({
      success: false,
      error: 'network_error',
      code: 'upstream',
    });
  });
});

describe('mapper helpers', () => {
  it('buildCustomerId formats org:user:rejestrio', () => {
    expect(buildCustomerId('org_1', 'user_1')).toBe('org_1:user_1:rejestrio');
  });

  it('payloadToColumnFields maps every enrichment field with the _enrichment_ prefix', () => {
    const out = payloadToColumnFields({
      krs: '0000111222',
      nip: '1234567890',
      regon: '999',
      nazwaPelna: 'Acme Sp. z o.o.',
      nazwaSkrocona: 'Acme',
      formaPrawna: 'sp. z o.o.',
      pkdGlowny: '62.01.Z',
      miejscowosc: 'Warszawa',
      kodPocztowy: '00-001',
      wykreslona: false,
      wUpadlosci: false,
      wLikwidacji: false,
      przychodyPln: 123,
      zyskPln: 12,
      aktywaPln: 456,
      sprawozdanieRocznik: 2024,
    });

    expect(out._enrichment_krs).toBe('0000111222');
    expect(out._enrichment_nazwa_pelna).toBe('Acme Sp. z o.o.');
    expect(out._enrichment_nazwa_skrocona).toBe('Acme');
    expect(out._enrichment_przychody_pln).toBe(123);
    expect(Object.keys(out).every((k) => k.startsWith('_enrichment_'))).toBe(
      true,
    );
  });
});
