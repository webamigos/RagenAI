import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLiteLLMClient } from '../client';

const logger = { warn: vi.fn(), error: vi.fn() };

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

function client(overrides = {}) {
  return createLiteLLMClient({
    proxyUrl: 'http://litellm.test',
    masterKey: 'sk-master',
    logger,
    ...overrides,
  });
}

describe('configuration', () => {
  it('sends the master key as a bearer token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ healthy_endpoints: [] }));

    await client().getLiteLLMHealth();

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer sk-master',
    );
  });

  // The proxy runs without auth in local dev, and an empty Authorization
  // header is not the same as no header.
  it('omits the header entirely when no master key is configured', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    // Without this the client falls back to the ambient LITELLM_MASTER_KEY and
    // the test passes or fails depending on the developer's shell.
    vi.stubEnv('LITELLM_MASTER_KEY', '');

    await client({ masterKey: undefined }).getLiteLLMHealth();

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('reports the proxy URL it was built with', () => {
    expect(client().getLiteLLMProxyUrl()).toBe('http://litellm.test');
  });

  /**
   * The model cache used to be module state. Two clients pointed at different
   * proxies would then serve each other's answers — which is exactly the shape
   * of an e2e run against a mock proxy leaking into a dev process.
   */
  it('does not share its model cache with another instance', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: 'gpt-5.4', owned_by: 'openai' }] }),
    );
    await client().fetchLiteLLMModels();

    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ id: 'claude-sonnet-4-6', owned_by: 'anthropic' }],
      }),
    );
    const second = await client({
      proxyUrl: 'http://other.test',
    }).fetchLiteLLMModels();

    expect(second.map((m) => m.value)).toEqual(['claude-sonnet-4-6']);
  });
});

describe('getLiteLLMHealth', () => {
  it('returns the whole payload, not just reachability', async () => {
    const payload = {
      healthy_endpoints: [{ model: 'gpt-5.4' }],
      unhealthy_endpoints: [{ model: 'claude-sonnet-4-6', error: 'timeout' }],
      healthy_count: 1,
      unhealthy_count: 1,
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(client().getLiteLLMHealth()).resolves.toEqual(payload);
  });

  it.each([
    ['a non-ok response', () => jsonResponse({}, 500)],
    ['an unreachable proxy', () => Promise.reject(new Error('ECONNREFUSED'))],
  ])('returns null on %s rather than throwing', async (_label, make) => {
    fetchMock.mockImplementation(() => make());

    await expect(client().getLiteLLMHealth()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('getLiteLLMModelInfo', () => {
  it('unwraps the data array', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { model_name: 'gpt-5.4', litellm_params: { model: 'azure/gpt-5.4' } },
        ],
      }),
    );

    const info = await client().getLiteLLMModelInfo();

    expect(info).toHaveLength(1);
    // The upstream is the reason this endpoint is worth calling: /v1/models
    // returns only an id, so provider attribution is otherwise a guess.
    expect(info[0].litellm_params?.model).toBe('azure/gpt-5.4');
  });

  it('returns an empty list when the endpoint is unavailable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401));

    await expect(client().getLiteLLMModelInfo()).resolves.toEqual([]);
  });
});

describe('getLiteLLMKeyInfo', () => {
  it('accepts both the wrapped and bare response shapes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ info: { spend: 12.5 } }));
    await expect(client().getLiteLLMKeyInfo('sk-1')).resolves.toMatchObject({
      spend: 12.5,
    });

    fetchMock.mockResolvedValue(jsonResponse({ spend: 3 }));
    await expect(client().getLiteLLMKeyInfo('sk-1')).resolves.toMatchObject({
      spend: 3,
    });
  });

  it('returns null for an unknown key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    await expect(client().getLiteLLMKeyInfo('sk-missing')).resolves.toBeNull();
  });

  it('url-encodes the key it looks up', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await client().getLiteLLMKeyInfo('sk-a/b+c');

    expect(fetchMock.mock.calls[0][0]).toContain('sk-a%2Fb%2Bc');
  });
});

describe('updateLiteLLMTeam', () => {
  it('sends only the fields it was given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ team_id: 't-1' }));

    await client().updateLiteLLMTeam({ teamId: 't-1', models: ['gpt-5.4'] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ team_id: 't-1', models: ['gpt-5.4'] });
    expect(body).not.toHaveProperty('max_budget');
  });

  // The retry wrapper decides retryability by scraping the status out of this
  // message, so the shape matters beyond readability.
  it('throws with the status embedded in the message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'no such team' }, 404));

    await expect(
      client().updateLiteLLMTeam({ teamId: 'nope' }),
    ).rejects.toThrow(/: 404 /);
  });
});

describe('getLiteLLMTeamInfo', () => {
  it('returns null for a team the proxy does not have', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    await expect(client().getLiteLLMTeamInfo('nope')).resolves.toBeNull();
  });

  it('unwraps team_info when the proxy wraps it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ team_info: { team_id: 't-1', spend: 4, max_budget: 10 } }),
    );

    await expect(client().getLiteLLMTeamInfo('t-1')).resolves.toMatchObject({
      team_id: 't-1',
      spend: 4,
      max_budget: 10,
    });
  });
});
