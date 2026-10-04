import { describe, expect, it, vi } from 'vitest';

import { runAssistants, type AssistantsDeps } from '../assistants';

function harness(status: number, body: unknown) {
  const out: string[] = [];
  const err: string[] = [];
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  const deps: AssistantsDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: { RAGEN_API_URL: 'https://api.example.com', RAGEN_API_KEY: 'sk-k.s' },
    out: (m) => out.push(m),
    err: (m) => err.push(m),
  };
  return { deps, out, err, fetchMock };
}

describe('ragen assistants ls', () => {
  it('lists id, name and model in aligned columns', async () => {
    const { deps, out, fetchMock } = harness(200, {
      data: [
        {
          id: 'a-1',
          name: 'Support',
          model: 'gpt-oss-120b',
          description: null,
        },
        {
          id: 'a-2',
          name: 'HR policies',
          model: 'mistral-small-3.2',
          description: null,
        },
      ],
    });
    await expect(runAssistants(['ls'], deps)).resolves.toBe(0);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.example.com/v1/assistants?limit=100',
    );
    expect(out[0]!.split('\n')).toEqual([
      'a-1  Support      gpt-oss-120b',
      'a-2  HR policies  mistral-small-3.2',
    ]);
  });

  it('explains an empty list rather than printing nothing', async () => {
    const { deps, out } = harness(200, { data: [] });
    await runAssistants(['ls'], deps);
    expect(out[0]).toMatch(/No assistants for this key/);
  });

  it('rejects an unknown subcommand', async () => {
    const { deps, err } = harness(200, { data: [] });
    await expect(runAssistants(['rm'], deps)).resolves.toBe(1);
    expect(err[0]).toMatch(/Unknown assistants command: rm/);
  });
});
