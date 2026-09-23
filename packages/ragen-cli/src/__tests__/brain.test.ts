import { describe, expect, it, vi } from 'vitest';

import { runBrain, type BrainDeps } from '../brain';
import { embedJson, renderGraphHtml } from '../graph-html';

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

  it('writes the graph as a page when asked for --html', async () => {
    const view = {
      nodes: [
        { id: 'a', title: 'Urlop', community: 0, degree: 1, openFindings: 1 },
        { id: 'b', title: 'Kadry', community: 0, degree: 1 },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'part_of', origin: 'EXTRACTED' }],
      shown: { nodes: 2, edges: 1 },
      total: { nodes: 2, edges: 1 },
      communities: [],
      hiddenInferred: 0,
      focus: null,
    };
    const { d, out, written } = deps({ graph: { body: view } });
    await expect(
      runBrain(['graph', '--html', 'brain.html', '--budget', '300'], d),
    ).resolves.toBe(0);
    const html = written.get('brain.html')!;
    expect(html).toContain('<script type="application/json" id="view">');
    expect(html).toContain('"Urlop"');
    expect(out.join('\n')).toContain('Wrote brain.html');
  });

  it('asks a question through chat, with the assistant from the environment', async () => {
    const { d, out, fetchMock } = deps({
      '/v1/chat': { body: { text: 'Tak, praca zdalna wymaga zgody.' } },
    });
    d.env.RAGEN_ASSISTANT_ID = 'asst-1';
    await expect(
      runBrain(['query', 'Czy', 'praca', 'zdalna', 'wymaga', 'zgody?'], d),
    ).resolves.toBe(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example.com/v1/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      content: 'Czy praca zdalna wymaga zgody?',
      stream: false,
      assistant_id: 'asst-1',
    });
    expect(out.join('\n')).toBe('Tak, praca zdalna wymaga zgody.');
  });

  it('explains an unknown assistant instead of printing a status code', async () => {
    const { d, err } = deps({ '/v1/chat': { status: 404, body: {} } });
    await expect(
      runBrain(['query', 'x', '--assistant', 'nope'], d),
    ).resolves.toBe(1);
    expect(err.join('\n')).toContain('No such assistant');
  });

  it('refuses an empty question', async () => {
    const { d, err, fetchMock } = deps({});
    await expect(runBrain(['query'], d)).resolves.toBe(1);
    expect(err.join('\n')).toContain('Ask something');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('graph html', () => {
  it('cannot be closed early by a page title', () => {
    const html = renderGraphHtml(
      {
        nodes: [
          {
            id: 'a',
            title: '</script><img src=x onerror=alert(1)>',
            community: 0,
            degree: 0,
          },
        ],
        edges: [],
        shown: { nodes: 1, edges: 0 },
        total: { nodes: 1, edges: 0 },
      },
      'Brain <graph>',
    );
    const embedded = html.split('id="view">')[1]!.split('</script>')[0]!;
    expect(embedded).not.toContain('<');
    expect(JSON.parse(embedded).nodes[0].title).toBe(
      '</script><img src=x onerror=alert(1)>',
    );
    expect(html).toContain('<title>Brain &#60;graph&#62;</title>');
  });

  it('escapes the line separators JSON allows and JavaScript once did not', () => {
    expect(embedJson('a\u2028b')).toBe('"a\\u2028b"');
  });
});
