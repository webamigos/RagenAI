/**
 * What a failed Docling call tells the ingest: wait, or give up.
 *
 * Under DOCLING_STRICT the answer decides whether a file survives a busy or
 * restarting Docling. Busy or away — a refused connection, our own timeout,
 * 502/503/504, 429 — is transient and waited out. A conversion Docling itself
 * failed, a 4xx, an empty document: permanent, and retrying it only spends the
 * next file's slot (spec 2026-09-26-docling-under-load, A2/A3).
 */
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { convertWithDocling, DoclingError } from '../docling-client.js';

const convert = () => convertWithDocling('/tmp/f.pdf', 'f.pdf');

const failure = async (): Promise<DoclingError> => {
  const error = await convert().then(
    () => {
      throw new Error('expected the conversion to fail');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DoclingError);
  return error as DoclingError;
};

const answer = (status: number, body = 'nope') => {
  mockFetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('convertWithDocling failures', () => {
  it('reads a refused connection as transient', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: new Error('connect ECONNREFUSED 10.0.0.7:8080'),
    });
    mockFetch.mockRejectedValue(refused);

    const error = await failure();
    expect(error.transient).toBe(true);
    // The cause is where the reason is; `fetch failed` alone is what the demo
    // logged for twelve days.
    expect(error.message).toContain('ECONNREFUSED');
  });

  it('reads our own timeout as transient, and says how long it waited', async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    );

    const error = await failure();
    expect(error.transient).toBe(true);
    expect(error.message).toContain('no answer within 315s');
  });

  it.each([408, 429, 502, 503, 504])(
    'reads HTTP %i as busy, not wrong',
    async (status) => {
      answer(status);
      expect((await failure()).transient).toBe(true);
    },
  );

  it('names the setting when the sync wait runs out', async () => {
    answer(504, 'Conversion is taking too long.');
    expect((await failure()).message).toContain(
      'DOCLING_SERVE_MAX_SYNC_WAIT (300s)',
    );
  });

  it.each([400, 413, 415, 422, 500])(
    'reads HTTP %i as permanent',
    async (status) => {
      answer(status);
      expect((await failure()).transient).toBe(false);
    },
  );

  it('reads a conversion Docling failed as permanent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'failure',
        errors: ['unsupported format'],
        document: {},
      }),
    });

    const error = await failure();
    expect(error.transient).toBe(false);
    expect(error.message).toContain('unsupported format');
  });

  it('reads an empty document as permanent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        errors: [],
        document: { md_content: '  ' },
      }),
    });

    expect((await failure()).transient).toBe(false);
  });

  it('gives the request a deadline, so an abandoned attempt stops waiting', async () => {
    answer(503);
    await failure();
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
