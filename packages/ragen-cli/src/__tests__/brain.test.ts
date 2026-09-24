import { describe, expect, it, vi } from 'vitest';

import { runBrain, type BrainDeps } from '../brain';

function deps(responses: Record<string, { status?: number; body: unknown }>) {
  const out: string[] = [];
  const err: string[] = [];
  const written = new Map<string, string>();
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname.replace('/v1/brain/', '');
    const r = responses[path] ?? { status: 500, body: {} };
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      json: async () => r.body,
    } as Response;
  });
  const d: BrainDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: { RAGEN_API_URL: 'https://api.example.com/', RAGEN_API_KEY: 'sk-k.s' },
    writeFile: async (path, content) => {
      written.set(path, content);
    },
    mkdir: async () => {},
    out: (m) => out.push(m),
    err: (m) => err.push(m),
  };
  return { d, out, err, written, fetchMock };
}

describe('ragen brain', () => {
  it('asks the API with the key, and prints the next step', async () => {
    const { d, out, fetchMock } = deps({
      next: {
        body: {
          state: 'review',
          message: '3 candidate pages are waiting for review.',
          path: '/brain?status=CANDIDATE',
          command: 'ragen brain pages --status CANDIDATE',
        },
      },
    });
    await expect(runBrain(['next'], d)).resolves.toBe(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example.com/v1/brain/next');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-k.s',
    );
    expect(out.join('\n')).toContain('3 candidate pages');
    expect(out.join('\n')).toContain(
      'Then: ragen brain pages --status CANDIDATE',
    );
  });

  it('refuses to run without a URL and a key', async () => {
    const { d, err } = deps({});
    d.env = {};
    await expect(runBrain(['next'], d)).resolves.toBe(1);
    expect(err[0]).toMatch(/RAGEN_API_URL and RAGEN_API_KEY/);
  });

  it('explains a 404 as Brain being unavailable to this key', async () => {
    const { d, err } = deps({ next: { status: 404, body: {} } });
    await expect(runBrain(['next'], d)).resolves.toBe(1);
    expect(err[0]).toMatch(/not available for this key/);
  });

  it('exits non-zero from doctor when a check fails, so a script can gate on it', async () => {
    const { d, out } = deps({
      health: {
        body: [
          { name: 'brain', status: 'ok', detail: 'on', hint: null },
          {
            name: 'publication',
            status: 'error',
            detail: '1 stuck',
            hint: 'Is the worker running?',
          },
        ],
      },
    });
    await expect(runBrain(['doctor'], d)).resolves.toBe(1);
    expect(out.join('\n')).toContain('FAIL  publication');
    expect(out.join('\n')).toContain('Is the worker running?');
  });

  it('passes a search and a status to pages', async () => {
    const { d, fetchMock } = deps({ pages: { body: [] } });
    await runBrain(
      ['pages', 'urlop', 'wypoczynkowy', '--status', 'APPROVED'],
      d,
    );
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get('q')).toBe('urlop wypoczynkowy');
    expect(url.searchParams.get('status')).toBe('APPROVED');
  });

  it('writes the bundle under the directory and reports what was left out', async () => {
    const { d, out, written } = deps({
      export: {
        body: {
          files: {
            'pages/a.md': '# A\n',
            'graph.json': '{}',
            'manifest.json': '{}',
          },
          skipped: [{ title: 'B', reason: 'no-owner' }],
        },
      },
    });
    await expect(runBrain(['export', 'out'], d)).resolves.toBe(0);
    expect([...written.keys()].sort()).toEqual([
      'out/graph.json',
      'out/manifest.json',
      'out/pages/a.md',
    ]);
    expect(out.join('\n')).toContain('Wrote 1 pages');
    expect(out.join('\n')).toContain('no-owner 1');
  });

  it('refuses a bundle path that would escape the directory, writing nothing', async () => {
    const { d, err, written } = deps({
      export: {
        body: { files: { '../.env': 'x', 'manifest.json': '{}' }, skipped: [] },
      },
    });
    await expect(runBrain(['export', 'out'], d)).resolves.toBe(1);
    expect(err[0]).toMatch(/outside the target directory/);
    expect(written.size).toBe(0);
  });
});
