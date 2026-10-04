import { describe, expect, it, vi } from 'vitest';

import { formatBytes, runKb, type ApiFile, type KbDeps } from '../kb';

type Reply = {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
};

/**
 * A fake API keyed by "METHOD path". A value that is an array is a queue —
 * each call takes the next reply and the last one repeats — which is how a
 * file moves from `uploaded` to `processed` across polls.
 */
function harness(routes: Record<string, Reply | Reply[]>) {
  const out: string[] = [];
  const err: string[] = [];
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const key = `${init?.method ?? 'GET'} ${u.pathname.replace('/v1/', '')}`;
    const route = routes[key];
    let reply: Reply = route ?? { status: 500, body: {} };
    if (Array.isArray(route)) {
      reply = route.length > 1 ? route.shift()! : route[0]!;
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  });
  const files = new Map<string, Uint8Array>([
    ['./a.pdf', new Uint8Array([1, 2, 3])],
    ['./b.md', new Uint8Array([4])],
  ]);
  const deps: KbDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: { RAGEN_API_URL: 'https://api.example.com', RAGEN_API_KEY: 'sk-k.s' },
    readFile: async (path) => {
      const data = files.get(path);
      if (!data) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return data;
    },
    sleep,
    now: () => clock,
    out: (m) => out.push(m),
    err: (m) => err.push(m),
  };
  return { deps, out, err, fetchMock, sleep };
}

function file(
  id: string,
  status: ApiFile['status'],
  filename = `${id}.pdf`,
): ApiFile {
  return { id, bytes: 2048, created_at: 1_760_000_000, filename, status };
}

describe('ragen kb ls', () => {
  it('lists files with their status, size and id', async () => {
    const { deps, out } = harness({
      'GET files': {
        body: {
          object: 'list',
          data: [file('file-1', 'processed', 'handbook.pdf')],
        },
      },
    });
    await expect(runKb(['ls'], deps)).resolves.toBe(0);
    expect(out[0]).toMatch(
      /^processed\s+2\.0 KB\s+2025-10-09\s+handbook\.pdf\s+\(file-1\)$/,
    );
  });

  it('follows the cursor with --all until a short page', async () => {
    const full = Array.from({ length: 100 }, (_, i) =>
      file(`file-${i}`, 'processed'),
    );
    const { deps, fetchMock, out } = harness({
      'GET files': [
        { body: { data: full } },
        { body: { data: [file('file-last', 'uploaded')] } },
      ],
    });
    await expect(runKb(['ls', '--all'], deps)).resolves.toBe(0);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      'https://api.example.com/v1/files?limit=100',
      'https://api.example.com/v1/files?limit=100&after=file-99',
    ]);
    expect(out[0]!.split('\n')).toHaveLength(101);
  });

  it('refuses a --limit that is not a positive whole number', async () => {
    const { deps, err, fetchMock } = harness({});
    await expect(runKb(['ls', '--limit', 'ten'], deps)).resolves.toBe(1);
    expect(err[0]).toMatch(/positive whole number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ragen kb upload', () => {
  it('uploads each file as multipart with the knowledge_base purpose', async () => {
    const { deps, out, fetchMock } = harness({
      'POST files': [
        { body: file('file-a', 'uploaded', 'a.pdf') },
        { body: file('file-b', 'uploaded', 'b.md') },
      ],
    });
    await expect(runKb(['upload', './a.pdf', './b.md'], deps)).resolves.toBe(0);
    const form = (fetchMock.mock.calls[0]![1] as RequestInit).body as FormData;
    expect((form.get('file') as File).name).toBe('a.pdf');
    expect(form.get('purpose')).toBe('knowledge_base');
    expect(out).toEqual([
      'Uploaded a.pdf  (file-a)',
      'Uploaded b.md  (file-b)',
    ]);
  });

  it('waits out a rate limit and retries, instead of failing the file', async () => {
    const { deps, err, sleep } = harness({
      'POST files': [
        { status: 429, body: {}, headers: { 'Retry-After': '12' } },
        { body: file('file-a', 'uploaded', 'a.pdf') },
      ],
    });
    await expect(runKb(['upload', './a.pdf'], deps)).resolves.toBe(0);
    expect(sleep).toHaveBeenCalledWith(12_000);
    expect(err[0]).toMatch(/Rate limited; waiting 12s/);
  });

  it('does not retry a 429 without Retry-After — a ceiling, not a throttle — and stops the batch', async () => {
    const { deps, err, sleep, fetchMock } = harness({
      'POST files': {
        status: 429,
        body: { error: 'Monthly usage limit exceeded' },
      },
    });
    await expect(runKb(['upload', './a.pdf', './b.md'], deps)).resolves.toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.join('\n')).toContain('Monthly usage limit exceeded');
    expect(err.join('\n')).toContain('Stopped: 1 file(s) not uploaded.');
  });

  it('treats a Retry-After longer than any throttler asks for as final', async () => {
    const { deps, sleep, err } = harness({
      'POST files': {
        status: 429,
        body: {},
        headers: { 'Retry-After': '3600' },
      },
    });
    await expect(runKb(['upload', './a.pdf', './b.md'], deps)).resolves.toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(err.join('\n')).toContain('Stopped: 1 file(s) not uploaded.');
  });

  it('with --wait --json, still prints what was uploaded when waiting fails', async () => {
    const { deps, out, err } = harness({
      'POST files': { body: file('file-a', 'uploaded', 'a.pdf') },
      'GET files': { status: 502, body: {} },
    });
    await expect(
      runKb(['upload', './a.pdf', '--wait', '--json'], deps),
    ).resolves.toBe(1);
    expect(JSON.parse(out[0]!)).toEqual([file('file-a', 'uploaded', 'a.pdf')]);
    expect(err.join('\n')).toContain('Stopped waiting: The API answered 502.');
    expect(err.join('\n')).toContain('ragen kb status file-a');
  });

  it('carries on past an unreadable file but exits non-zero', async () => {
    const { deps, err, out } = harness({
      'POST files': { body: file('file-a', 'uploaded', 'a.pdf') },
    });
    await expect(
      runKb(['upload', './missing.pdf', './a.pdf'], deps),
    ).resolves.toBe(1);
    expect(err[0]).toMatch(/Cannot read \.\/missing\.pdf/);
    expect(out).toContain('Uploaded a.pdf  (file-a)');
  });

  it('names a directory as the problem, with the fix', async () => {
    const { deps, err } = harness({});
    deps.readFile = async () => {
      throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
    };
    await expect(runKb(['upload', './docs'], deps)).resolves.toBe(1);
    expect(err[0]).toBe(
      './docs is a directory. Name its files instead, e.g. ./docs/*.pdf',
    );
  });

  it('stops at a refused key rather than refusing every file in turn', async () => {
    const { deps, fetchMock } = harness({
      'POST files': { status: 401, body: {} },
    });
    await expect(runKb(['upload', './a.pdf', './b.md'], deps)).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with --wait, polls the list once per round until indexed, and exits 0', async () => {
    const { deps, out, fetchMock } = harness({
      'POST files': [
        { body: file('file-a', 'uploaded', 'a.pdf') },
        { body: file('file-b', 'uploaded', 'b.md') },
      ],
      'GET files': [
        {
          body: {
            data: [
              file('file-a', 'uploaded', 'a.pdf'),
              file('file-b', 'processed', 'b.md'),
            ],
          },
        },
        {
          body: {
            data: [
              file('file-a', 'processed', 'a.pdf'),
              file('file-b', 'processed', 'b.md'),
            ],
          },
        },
      ],
    });
    await expect(
      runKb(['upload', './a.pdf', './b.md', '--wait'], deps),
    ).resolves.toBe(0);
    expect(out).toContain('processed b.md');
    expect(out).toContain('processed a.pdf');
    // Two uploads, two list rounds — never a request per file per round.
    const gets = fetchMock.mock.calls.filter(
      (c) => ((c[1] as RequestInit | undefined)?.method ?? 'GET') === 'GET',
    );
    expect(gets).toHaveLength(2);
  });

  it('with --wait, asks by id for a file that has scrolled off the newest page', async () => {
    const { deps, out } = harness({
      'POST files': { body: file('file-a', 'uploaded', 'a.pdf') },
      'GET files': { body: { data: [] } },
      'GET files/file-a': { body: file('file-a', 'processed', 'a.pdf') },
    });
    await expect(runKb(['upload', './a.pdf', '--wait'], deps)).resolves.toBe(0);
    expect(out).toContain('processed a.pdf');
  });

  it('with --wait, waits out a 429 instead of failing a file that is still indexing', async () => {
    const { deps, sleep, err } = harness({
      'POST files': { body: file('file-a', 'uploaded', 'a.pdf') },
      'GET files': [
        { status: 429, body: {}, headers: { 'Retry-After-expensive': '30' } },
        { body: { data: [file('file-a', 'processed', 'a.pdf')] } },
      ],
    });
    await expect(runKb(['upload', './a.pdf', '--wait'], deps)).resolves.toBe(0);
    expect(sleep).toHaveBeenCalledWith(30_000);
    expect(err).toEqual([]);
  });

  it('with --wait, exits non-zero when a file fails to index', async () => {
    const { deps, err } = harness({
      'POST files': { body: file('file-a', 'uploaded', 'a.pdf') },
      'GET files': { body: { data: [file('file-a', 'error', 'a.pdf')] } },
    });
    await expect(runKb(['upload', './a.pdf', '--wait'], deps)).resolves.toBe(1);
    expect(err.join('\n')).toMatch(/a\.pdf failed to index/);
  });

  it('with --wait, treats a timeout as a failure and says how to check later', async () => {
    const { deps, err, fetchMock } = harness({
      'POST files': { body: file('file-a', 'uploaded', 'a.pdf') },
      'GET files': { body: { data: [file('file-a', 'uploaded', 'a.pdf')] } },
    });
    await expect(
      runKb(['upload', './a.pdf', '--wait', '--timeout', '5'], deps),
    ).resolves.toBe(1);
    // A timeout shorter than the poll interval still asks once.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(err.join('\n')).toContain('still being indexed after 5s');
    expect(err.join('\n')).toContain('ragen kb status file-a');
  });
});

describe('ragen kb status and rm', () => {
  it('exits non-zero from status when a file is in error, so a script can gate', async () => {
    const { deps, out } = harness({
      'GET files': {
        body: { data: [file('file-b', 'error'), file('file-a', 'processed')] },
      },
    });
    await expect(runKb(['status', 'file-a', 'file-b'], deps)).resolves.toBe(1);
    // In the order asked for, not the order listed.
    expect(out[0]!.split('\n')[0]).toContain('file-a');
  });

  it('reads many files from one list request rather than one request each', async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `file-${i}`);
    const { deps, fetchMock } = harness({
      'GET files': { body: { data: ids.map((id) => file(id, 'processed')) } },
    });
    await expect(runKb(['status', ...ids], deps)).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with --wait, waits for a file uploaded earlier', async () => {
    const { deps, out } = harness({
      'GET files': [
        { body: { data: [file('file-a', 'uploaded', 'a.pdf')] } },
        { body: { data: [file('file-a', 'processed', 'a.pdf')] } },
      ],
    });
    await expect(runKb(['status', 'file-a', '--wait'], deps)).resolves.toBe(0);
    expect(out).toContain('processed a.pdf');
  });

  it('says which file does not exist, rather than "Not found"', async () => {
    const { deps, err } = harness({
      'DELETE files/file-x': { status: 404, body: {} },
    });
    await expect(runKb(['rm', 'file-x'], deps)).resolves.toBe(1);
    expect(err[0]).toBe('No file file-x for this key.');
  });

  it('waits out a rate limit while deleting many files', async () => {
    const { deps, out, sleep } = harness({
      'DELETE files/file-a': [
        { status: 429, body: {}, headers: { 'Retry-After-expensive': '20' } },
        { body: { id: 'file-a', object: 'file', deleted: true } },
      ],
    });
    await expect(runKb(['rm', 'file-a'], deps)).resolves.toBe(0);
    expect(sleep).toHaveBeenCalledWith(20_000);
    expect(out).toEqual(['Deleted file-a']);
  });

  it('deletes each file', async () => {
    const { deps, out } = harness({
      'DELETE files/file-a': {
        body: { id: 'file-a', object: 'file', deleted: true },
      },
    });
    await expect(runKb(['rm', 'file-a'], deps)).resolves.toBe(0);
    expect(out).toEqual(['Deleted file-a']);
  });
});

describe('ragen kb, without a connection or a command', () => {
  it('asks for the URL and key', async () => {
    const { deps, err } = harness({});
    deps.env = {};
    await expect(runKb(['ls'], deps)).resolves.toBe(1);
    expect(err[0]).toMatch(/RAGEN_API_URL and RAGEN_API_KEY/);
  });

  it('prints usage and exits 1 with no subcommand', async () => {
    const { deps, out } = harness({});
    await expect(runKb([], deps)).resolves.toBe(1);
    expect(out[0]).toContain('ragen kb <command>');
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [150 * 1024 * 1024, '150 MB'],
  ])('%d is %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
