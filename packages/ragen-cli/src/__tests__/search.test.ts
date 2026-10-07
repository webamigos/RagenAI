import { describe, expect, it, vi } from 'vitest';

import { runSearch, type SearchDeps } from '../search';

function harness(status: number, body: unknown) {
  const out: string[] = [];
  const err: string[] = [];
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  const deps: SearchDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: { RAGEN_API_URL: 'https://api.example.com', RAGEN_API_KEY: 'sk-k.s' },
    out: (m) => out.push(m),
    err: (m) => err.push(m),
  };
  return { deps, out, err, fetchMock };
}

describe('ragen search', () => {
  it('posts the query, assistant and limit, and prints the context and sources', async () => {
    const { deps, out, fetchMock } = harness(200, {
      context: '[1] Refunds are issued within 14 days.',
      file_ids: ['8975ec13', 'file-2'],
    });
    await expect(
      runSearch(
        ['refund', 'policy', '--assistant', '11111111-1111-4111-8111-111111111111', '--max', '3'],
        deps,
      ),
    ).resolves.toBe(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example.com/v1/search');
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'refund policy',
      assistant_id: '11111111-1111-4111-8111-111111111111',
      max_results: 3,
    });
    expect(out[0]).toContain('Refunds are issued');
    // Bare ids from /v1/search, printed the way `ragen kb` prints them.
    expect(out[1]).toContain('From 2 file(s): file-8975ec13, file-2');
  });

  it('says so when nothing was found, instead of printing a blank line', async () => {
    const { deps, out } = harness(200, { context: '', file_ids: [] });
    await expect(runSearch(['nothing'], deps)).resolves.toBe(0);
    expect(out).toEqual(['Nothing relevant found.']);
  });

  it('explains an unknown assistant', async () => {
    const { deps, err } = harness(404, {});
    await expect(runSearch(['q', '--assistant', 'nope'], deps)).resolves.toBe(
      1,
    );
    expect(err[0]).toMatch(/No such assistant/);
  });

  it('prints usage and exits 1 with no query', async () => {
    const { deps, out } = harness(200, {});
    await expect(runSearch([], deps)).resolves.toBe(1);
    expect(out[0]).toContain('ragen search <query>');
  });
});
