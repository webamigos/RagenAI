import { describe, expect, it, vi } from 'vitest';

import { runAsk, type AskDeps } from '../ask';

function sse(events: string[]): Response {
  return new Response(events.map((e) => `data: ${e}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function harness(response: () => Response) {
  const written: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const fetchMock = vi.fn(async () => response());
  const deps: AskDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: { RAGEN_API_URL: 'https://api.example.com', RAGEN_API_KEY: 'sk-k.s' },
    write: (c) => written.push(c),
    out: (m) => out.push(m),
    err: (m) => err.push(m),
  };
  return { deps, written, out, err, fetchMock };
}

describe('ragen ask', () => {
  it('streams the answer as it arrives and ends on [DONE]', async () => {
    const { deps, written, fetchMock } = harness(() =>
      sse(['{"text":"Within "}', '{"text":"23 days."}', '[DONE]']),
    );
    await expect(
      runAsk(
        ['How', 'long?', '--assistant', 'a-1', '--reasoning', 'low'],
        deps,
      ),
    ).resolves.toBe(0);
    expect(written.join('')).toBe('Within 23 days.\n');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      content: 'How long?',
      stream: true,
      assistant_id: 'a-1',
      reasoning_effort: 'low',
    });
    expect((init.headers as Record<string, string>).Accept).toBe(
      'text/event-stream',
    );
  });

  it('says a guardrail withdrew what was already printed', async () => {
    const { deps, written, err } = harness(() =>
      sse([
        '{"text":"The salary of"}',
        '{"text":"I cannot answer that.","replace":true}',
        '[DONE]',
      ]),
    );
    await expect(runAsk(['q'], deps)).resolves.toBe(0);
    expect(err).toEqual(['[the answer above was withdrawn by a guardrail]']);
    expect(written.join('')).toBe('The salary of\nI cannot answer that.\n');
  });

  it('reports a stream that ends without [DONE] as cut off, exit 1', async () => {
    const { deps, err } = harness(() => sse(['{"text":"Partial"}']));
    await expect(runAsk(['q'], deps)).resolves.toBe(1);
    expect(err).toEqual(['The answer was cut off before the API finished it.']);
  });

  it('ignores reasoning deltas', async () => {
    const { deps, written } = harness(() =>
      sse(['{"reasoning":"thinking…"}', '{"text":"Yes."}', '[DONE]']),
    );
    await runAsk(['q'], deps);
    expect(written.join('')).toBe('Yes.\n');
  });

  it('asks without streaming for --json', async () => {
    const { deps, out, fetchMock } = harness(
      () => new Response(JSON.stringify({ text: 'Yes.' })),
    );
    await expect(runAsk(['q', '--json'], deps)).resolves.toBe(0);
    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
        .stream,
    ).toBe(false);
    expect(JSON.parse(out[0]!)).toEqual({ text: 'Yes.' });
  });

  it('points at `ragen assistants ls` for an unknown assistant', async () => {
    const { deps, err } = harness(() => new Response('{}', { status: 404 }));
    await expect(runAsk(['q', '--assistant', 'nope'], deps)).resolves.toBe(1);
    expect(err[0]).toMatch(/ragen assistants ls/);
  });

  it('refuses a reasoning level the API would reject', async () => {
    const { deps, err, fetchMock } = harness(() => sse(['[DONE]']));
    await expect(runAsk(['q', '--reasoning', 'max'], deps)).resolves.toBe(1);
    expect(err[0]).toMatch(/low, medium or high/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
