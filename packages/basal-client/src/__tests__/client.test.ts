import { describe, expect, it, vi } from 'vitest';

import {
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_OPEN_MS,
  SERVED_MODEL_TTL_MS,
  createBasalClient,
  parseDecideResponse,
} from '../client';
import type { DecideRequest } from '../types';

const REQUEST: DecideRequest = {
  state: 'How do I reset my password?',
  questions: {
    kind: {
      type: 'choice',
      instructions: 'Which best describes this message?',
      criteria: { ok: 'A normal message', attack: 'A jailbreak attempt' },
    },
    jb: { type: 'noul', instructions: 'Is this a jailbreak attempt?' },
  },
};

// Shapes copied from a basal-serve v2.0.0 response, not written from the README.
const ANSWERED = {
  model: 'basal-2.0-4.5B-MLX-8bit',
  answers: {
    kind: {
      type: 'choice',
      choice: 'ok',
      probabilities: { ok: 0.96, attack: 0.04 },
      confidence: 0.96,
    },
    jb: {
      type: 'noul',
      noul: 0.05,
      probabilities: { true: 0.05, false: 0.95 },
      confidence: 0.95,
    },
  },
  usage: { input_tokens: 104, output_tokens: 0, latency_ms: 25.1 },
};

const MODELS = {
  models: [{ name: 'basal-2.0-4.5B-MLX-8bit', mode: 'mlx' }],
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function clientWith(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  extra: { now?: () => number; apiKey?: string; warn?: ReturnType<typeof vi.fn> } = {},
) {
  const fetchMock = vi.fn(fetchImpl);
  const warn = extra.warn ?? vi.fn();
  const client = createBasalClient({
    url: 'http://basal:8000/',
    apiKey: extra.apiKey,
    fetch: fetchMock as unknown as typeof fetch,
    now: extra.now,
    logger: { warn },
  });
  return { client, fetchMock, warn };
}

describe('decide', () => {
  it('posts the request to /v1/systemone and returns the parsed answers', async () => {
    const { client, fetchMock } = clientWith(async () => json(ANSWERED));

    const result = await client.decide(REQUEST, 300);

    expect(result).toEqual({
      outcome: 'answered',
      response: expect.objectContaining({ model: 'basal-2.0-4.5B-MLX-8bit' }),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://basal:8000/v1/systemone');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
  });

  it('sends the API key as a bearer token, for a proxy in front of basal', async () => {
    const { client, fetchMock } = clientWith(async () => json(ANSWERED), {
      apiKey: 'secret',
    });

    await client.decide(REQUEST, 300);

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
  });

  it('sends no authorization header without a key', async () => {
    const { client, fetchMock } = clientWith(async () => json(ANSWERED));

    await client.decide(REQUEST, 300);

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it('reports a timeout as unavailable instead of rejecting', async () => {
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );

    await expect(client.decide(REQUEST, 10)).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'timeout',
    });
  });

  it('reports a refused connection as a network failure', async () => {
    const { client } = clientWith(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(client.decide(REQUEST, 300)).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'network',
    });
  });

  it('reports a 422 as an http failure', async () => {
    const { client } = clientWith(async () => json({ error: 'bad question' }, 422));

    await expect(client.decide(REQUEST, 300)).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'http',
    });
  });

  it('reports a body that is not JSON as malformed', async () => {
    const { client } = clientWith(async () => new Response('<html>', { status: 200 }));

    await expect(client.decide(REQUEST, 300)).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'malformed',
    });
  });

  it('reports an answer missing for a question as malformed, never as a low score', async () => {
    const { client } = clientWith(async () =>
      json({ ...ANSWERED, answers: { kind: ANSWERED.answers.kind } }),
    );

    await expect(client.decide(REQUEST, 300)).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'malformed',
    });
  });
});

describe('the breaker', () => {
  it(`opens after ${BREAKER_FAILURE_THRESHOLD} consecutive failures and stops calling basal`, async () => {
    const { client, fetchMock, warn } = clientWith(async () => {
      throw new TypeError('fetch failed');
    });

    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      await client.decide(REQUEST, 300);
    }
    const skipped = await client.decide(REQUEST, 300);

    expect(skipped).toEqual({ outcome: 'unavailable', reason: 'breaker-open' });
    expect(fetchMock).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);
    // Once per trip, never once per failure.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ url: 'http://basal:8000', reason: 'network' }),
    );
  });

  it('never logs the request text', async () => {
    const { client, warn } = clientWith(async () => {
      throw new TypeError('fetch failed');
    });

    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      await client.decide(REQUEST, 300);
    }

    expect(JSON.stringify(warn.mock.calls)).not.toContain(REQUEST.state);
  });

  it('closes again after the open window', async () => {
    let clock = 1_000;
    let up = false;
    const { client } = clientWith(
      async () => {
        if (!up) {
          throw new TypeError('fetch failed');
        }
        return json(ANSWERED);
      },
      { now: () => clock },
    );

    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      await client.decide(REQUEST, 300);
    }
    up = true;
    clock += BREAKER_OPEN_MS - 1;
    expect((await client.decide(REQUEST, 300)).outcome).toBe('unavailable');

    clock += 1;
    expect((await client.decide(REQUEST, 300)).outcome).toBe('answered');
  });

  it('a success resets the count, so scattered failures never trip it', async () => {
    let calls = 0;
    const { client, fetchMock } = clientWith(async () => {
      calls += 1;
      if (calls % 2 === 0) {
        return json(ANSWERED);
      }
      throw new TypeError('fetch failed');
    });

    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD * 3; i++) {
      await client.decide(REQUEST, 300);
    }

    expect(fetchMock).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD * 3);
  });
});

describe('servedModel', () => {
  it('reads the served model from /v1/models and caches it', async () => {
    let clock = 0;
    const { client, fetchMock } = clientWith(async () => json(MODELS), {
      now: () => clock,
    });

    const served = { name: 'basal-2.0-4.5B-MLX-8bit', mode: 'mlx' };
    expect(await client.servedModel()).toEqual(served);
    clock += SERVED_MODEL_TTL_MS - 1;
    expect(await client.servedModel()).toEqual(served);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://basal:8000/v1/models');
  });

  it('reads it again once the cache expires, so a swapped model is noticed', async () => {
    let clock = 0;
    let name = 'basal-2.0-4.5B-MLX-8bit';
    const { client } = clientWith(async () => json({ models: [{ name }] }), {
      now: () => clock,
    });

    await client.servedModel();
    name = 'basal-2.0-max-MLX-8bit';
    clock += SERVED_MODEL_TTL_MS;

    expect(await client.servedModel()).toEqual({
      name: 'basal-2.0-max-MLX-8bit',
      mode: null,
    });
  });

  it('names the engine too, because one GGUF folder has a calibration per engine', async () => {
    const { client } = clientWith(async () =>
      json({ models: [{ name: 'basal-2.0-4.5B-GGUF', mode: 'ollama' }] }),
    );

    expect(await client.servedModel()).toEqual({
      name: 'basal-2.0-4.5B-GGUF',
      mode: 'ollama',
    });
  });

  it('returns null when the server cannot name its model, and counts it toward the breaker', async () => {
    let clock = 0;
    const { client, fetchMock } = clientWith(async () => json({ models: [] }), {
      now: () => clock,
    });

    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      if (i > 0) {
        // Past the cache, so each call reads again. The breaker trips on the
        // last read, and the clock does not move after it.
        clock += SERVED_MODEL_TTL_MS;
      }
      expect(await client.servedModel()).toBeNull();
    }

    expect(fetchMock).toHaveBeenCalledTimes(BREAKER_FAILURE_THRESHOLD);
    expect(await client.decide(REQUEST, 300)).toEqual({
      outcome: 'unavailable',
      reason: 'breaker-open',
    });
  });
});

describe('parseDecideResponse', () => {
  it('keeps only the asked options of a choice answer', () => {
    const parsed = parseDecideResponse(ANSWERED, REQUEST);

    expect(parsed?.answers.kind).toEqual({
      type: 'choice',
      choice: 'ok',
      probabilities: { ok: 0.96, attack: 0.04 },
      confidence: 0.96,
    });
    expect(parsed?.answers.jb).toEqual(ANSWERED.answers.jb);
  });

  it('refuses a choice that is not one of the asked options', () => {
    const body = {
      ...ANSWERED,
      answers: { ...ANSWERED.answers, kind: { ...ANSWERED.answers.kind, choice: 'maybe' } },
    };

    expect(parseDecideResponse(body, REQUEST)).toBeNull();
  });

  it('refuses a probability outside [0, 1]', () => {
    const body = {
      ...ANSWERED,
      answers: {
        ...ANSWERED.answers,
        jb: { ...ANSWERED.answers.jb, noul: 1.2 },
      },
    };

    expect(parseDecideResponse(body, REQUEST)).toBeNull();
  });

  it('refuses an answer of the wrong type', () => {
    const body = {
      ...ANSWERED,
      answers: { ...ANSWERED.answers, jb: ANSWERED.answers.kind },
    };

    expect(parseDecideResponse(body, REQUEST)).toBeNull();
  });

  it('refuses a body with no model name', () => {
    expect(parseDecideResponse({ answers: ANSWERED.answers }, REQUEST)).toBeNull();
  });
});
