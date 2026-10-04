import {
  EXPECTED_TOOLS,
  formatResults,
  runSmoke,
  type SmokeClient,
} from '../smoke.js';

type ToolAnswers = Record<string, unknown>;

/** A tool that threw: the server answers with its message and `isError`. */
class Thrown {
  constructor(readonly message: string) {}
}

/** A client whose every answer is chosen by the test. */
function fakeClient(
  answers: ToolAnswers = {},
  overrides: Partial<SmokeClient> = {},
): SmokeClient & { calls: string[]; closed: boolean } {
  const fake = {
    calls: [] as string[],
    closed: false,
    connect: async () => ({ name: 'Ragen', version: '2.37.0' }),
    listTools: async () => [...EXPECTED_TOOLS],
    callTool: async (name: string) => {
      fake.calls.push(name);
      const answer = answers[name];
      if (answer instanceof Thrown) {
        return { text: answer.message, isError: true };
      }
      return {
        text: typeof answer === 'string' ? answer : JSON.stringify(answer),
        isError: false,
      };
    },
    close: async () => {
      fake.closed = true;
    },
    ...overrides,
  };
  return fake;
}

const HEALTHY: ToolAnswers = {
  ragen_list_assistants: {
    success: true,
    assistants: [{ id: 'a1', name: 'Support Bot' }],
  },
  ragen_search_knowledge_base: {
    success: true,
    context: 'Refund policy…',
    file_ids: ['f1', 'f2'],
  },
  ragen_chat: { success: true, text: 'Returns are accepted within 30 days.' },
};

const withKey = { hasKey: true, query: 'refunds' };

describe('runSmoke', () => {
  it('passes every layer of a healthy deployment, and closes the client', async () => {
    const client = fakeClient(HEALTHY);

    const results = await runSmoke(client, { ...withKey, chatMessage: 'Hi' });

    expect(results.map((r) => [r.step, r.outcome])).toEqual([
      ['initialize', 'ok'],
      ['tools/list', 'ok'],
      ['ragen_list_assistants', 'ok'],
      ['ragen_search_knowledge_base', 'ok'],
      ['ragen_chat', 'ok'],
    ]);
    expect(results[0]?.detail).toBe('Ragen 2.37.0');
    expect(client.closed).toBe(true);
  });

  it('calls ragen_chat only when asked to, because it spends model tokens', async () => {
    const client = fakeClient(HEALTHY);

    await runSmoke(client, withKey);

    expect(client.calls).not.toContain('ragen_chat');
  });

  // Steps 1 and 2 check the MCP server alone, so they are worth running
  // without a key; the rest would only fail on its absence.
  it('runs the server-only steps without a key, and says why the rest were skipped', async () => {
    const client = fakeClient(HEALTHY);

    const results = await runSmoke(client, { hasKey: false, query: 'x' });

    expect(results.map((r) => r.outcome)).toEqual([
      'ok',
      'ok',
      'skipped',
      'skipped',
    ]);
    expect(client.calls).toEqual([]);
  });

  it('names the header when the server refuses the connection', async () => {
    const client = fakeClient(HEALTHY, {
      connect: async () => {
        throw new Error(
          'HTTP 401: Streamable HTTP error: Error POSTing to endpoint: ',
        );
      },
    });

    const [result, ...rest] = await runSmoke(client, withKey);

    expect(result).toMatchObject({ step: 'initialize', outcome: 'failed' });
    expect(result?.outcome === 'failed' && result.hint).toMatch(
      /Authorization header/,
    );
    expect(rest).toEqual([]);
  });

  it('flags a server that does not serve all three tools', async () => {
    const client = fakeClient(HEALTHY, {
      listTools: async () => ['ragen_chat'],
    });

    const results = await runSmoke(client, withKey);

    expect(results[1]).toMatchObject({
      step: 'tools/list',
      outcome: 'failed',
      detail: 'missing ragen_list_assistants, ragen_search_knowledge_base',
    });
    expect(client.calls).toEqual([]);
  });

  // Each case is one of the failures met on a real deployment: the hint has
  // to point at the service and the variable, because the MCP server's own
  // health check passes in all of them.
  it.each([
    [0, /RAGEN_API_URL on the MCP server/],
    [401, /RAGEN_TOKEN_VAULT_URL/],
    [403, /scope/],
    [500, /QDRANT_URL/],
  ])(
    'stops at a key rejected with status %i and points at the cause',
    async (status, hint) => {
      const client = fakeClient({
        ...HEALTHY,
        ragen_list_assistants: { success: false, status, error: 'nope' },
      });

      const results = await runSmoke(client, withKey);
      const last = results.at(-1);

      expect(last).toMatchObject({
        step: 'ragen_list_assistants',
        outcome: 'failed',
        detail: `status ${status}: nope`,
      });
      expect(last?.outcome === 'failed' && last.hint).toMatch(hint);
      expect(client.calls).toEqual(['ragen_list_assistants']);
    },
  );

  // The failure this script exists for: the key works, so listing passes,
  // and retrieval fails because the api has no vector store.
  it('passes the key and fails retrieval separately', async () => {
    const client = fakeClient({
      ...HEALTHY,
      ragen_search_knowledge_base: {
        success: false,
        status: 500,
        error: 'Internal Server Error',
      },
    });

    const results = await runSmoke(client, { ...withKey, chatMessage: 'Hi' });

    expect(results.map((r) => r.outcome)).toEqual(['ok', 'ok', 'ok', 'failed']);
  });

  it('reports a search that found nothing as working retrieval, not a failure', async () => {
    const client = fakeClient({
      ...HEALTHY,
      ragen_search_knowledge_base: { success: true, context: '', file_ids: [] },
    });

    const results = await runSmoke(client, withKey);

    expect(results.at(-1)).toMatchObject({
      outcome: 'ok',
      detail: expect.stringContaining('found nothing'),
    });
  });

  it('blames the MCP server, not a version mismatch, when a tool threw', async () => {
    const client = fakeClient({
      ...HEALTHY,
      ragen_list_assistants: new Thrown(
        "Tool 'ragen_list_assistants' execution failed: boom",
      ),
    });

    const results = await runSmoke(client, withKey);
    const last = results.at(-1);

    expect(last).toMatchObject({
      step: 'ragen_list_assistants',
      outcome: 'failed',
      detail: "Tool 'ragen_list_assistants' execution failed: boom",
    });
    expect(last?.outcome === 'failed' && last.hint).toMatch(
      /MCP server's logs/,
    );
    expect(last?.outcome === 'failed' && last.hint).not.toMatch(/version/);
  });

  it('fails on a tool answer that is not the JSON envelope', async () => {
    const client = fakeClient({ ...HEALTHY, ragen_list_assistants: 'oops' });

    const results = await runSmoke(client, withKey);

    expect(results.at(-1)).toMatchObject({
      step: 'ragen_list_assistants',
      outcome: 'failed',
      detail: 'oops',
    });
  });
});

describe('formatResults', () => {
  it('prints one line per step and the hint under a failure', () => {
    expect(
      formatResults([
        { step: 'initialize', outcome: 'ok', detail: 'Ragen 2.37.0' },
        {
          step: 'ragen_list_assistants',
          outcome: 'failed',
          detail: 'status 401: Invalid API key',
          hint: 'Check the key.',
        },
        { step: 'ragen_chat', outcome: 'skipped', detail: 'no RAGEN_API_KEY' },
      ]),
    ).toBe(
      [
        '✓ initialize: Ragen 2.37.0',
        '✗ ragen_list_assistants: status 401: Invalid API key',
        '  → Check the key.',
        '- ragen_chat: no RAGEN_API_KEY',
      ].join('\n'),
    );
  });
});
