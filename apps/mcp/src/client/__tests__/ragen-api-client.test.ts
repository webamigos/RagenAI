import {
  chat,
  listAssistants,
  searchKnowledgeBase,
} from '../ragen-api-client.js';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('chat', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends the request to /v1/chat with the Authorization header forwarded and stream forced false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'Hello back' }),
    });

    const result = await chat('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      content: 'Hi',
    });

    expect(result).toEqual({ ok: true, text: 'Hello back' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test.secret',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body).toEqual({
      assistant_id: 'asst-1',
      content: 'Hi',
      stream: false,
    });
  });

  it('parses a JSON error body (404/429 shape) into the error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: 'Assistant not found', code: 404 }),
        ),
    });

    const result = await chat('Bearer sk-test.secret', {
      assistant_id: 'missing',
      content: 'Hi',
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: 'Assistant not found',
    });
  });

  it('parses a JSON error body shaped { message } (a guard-level Nest exception filter, e.g. a vault outage during auth)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () =>
        Promise.resolve(JSON.stringify({ message: 'Internal server error' })),
    });

    const result = await chat('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      content: 'Hi',
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: 'Internal server error',
    });
  });

  it('falls back to the raw body when the error is not JSON (the 500 plain-text shape)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await chat('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      content: 'Hi',
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: 'Internal Server Error',
    });
  });

  it('returns a success:false envelope when fetch itself rejects (network/abort failure)', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));

    const result = await chat('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      content: 'Hi',
    });

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: 'fetch failed',
    });
  });

  it('passes optional context and reasoning_effort through', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'ok' }),
    });

    await chat('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      content: 'Hi',
      context: 'page content',
      reasoning_effort: 'high',
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body).toMatchObject({
      context: 'page content',
      reasoning_effort: 'high',
    });
  });
});

describe('listAssistants', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends the request to GET /v1/assistants with the Authorization header forwarded', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          object: 'list',
          data: [
            { id: 'asst-1', name: 'Support Bot', model: 'ragen' },
            { id: 'asst-2', name: 'Sales Bot', model: 'ragen' },
          ],
        }),
    });

    const result = await listAssistants('Bearer sk-test.secret');

    expect(result).toEqual({
      ok: true,
      assistants: [
        { id: 'asst-1', name: 'Support Bot' },
        { id: 'asst-2', name: 'Sales Bot' },
      ],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/assistants'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test.secret',
        }),
      }),
    );
  });

  it('returns an empty list when the org has no assistants', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ object: 'list', data: [] }),
    });

    const result = await listAssistants('Bearer sk-test.secret');

    expect(result).toEqual({ ok: true, assistants: [] });
  });

  it('parses the OpenAI-style { error: { message } } envelope AssistantsController uses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: {
              message: 'Invalid API key',
              type: 'authentication_error',
              code: null,
            },
          }),
        ),
    });

    const result = await listAssistants('Bearer sk-bad.secret');

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: 'Invalid API key',
    });
  });

  it('falls back to the raw body when the error is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await listAssistants('Bearer sk-test.secret');

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: 'Internal Server Error',
    });
  });

  it('returns a success:false envelope when fetch itself rejects (network/abort failure)', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));

    const result = await listAssistants('Bearer sk-test.secret');

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: 'fetch failed',
    });
  });
});

describe('searchKnowledgeBase', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends the request to POST /v1/search with the Authorization header forwarded', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          context: '<chunk file="policy.md">Refunds within 30 days.</chunk>',
          file_ids: ['file-1'],
        }),
    });

    const result = await searchKnowledgeBase('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      query: 'refund policy',
    });

    expect(result).toEqual({
      ok: true,
      context: '<chunk file="policy.md">Refunds within 30 days.</chunk>',
      fileIds: ['file-1'],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/search'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test.secret',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body).toEqual({ assistant_id: 'asst-1', query: 'refund policy' });
  });

  it('parses the { message } error shape from the global ApiExceptionFilter', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () =>
        Promise.resolve(JSON.stringify({ message: 'Assistant not found' })),
    });

    const result = await searchKnowledgeBase('Bearer sk-test.secret', {
      assistant_id: 'missing',
      query: 'refund policy',
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: 'Assistant not found',
    });
  });

  it('falls back to the raw body when the error is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await searchKnowledgeBase('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      query: 'refund policy',
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: 'Internal Server Error',
    });
  });

  it('returns a success:false envelope when fetch itself rejects (network/abort failure)', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));

    const result = await searchKnowledgeBase('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      query: 'refund policy',
    });

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: 'fetch failed',
    });
  });

  it('passes max_results through when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ context: '', file_ids: [] }),
    });

    await searchKnowledgeBase('Bearer sk-test.secret', {
      assistant_id: 'asst-1',
      query: 'refund policy',
      max_results: 3,
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body).toMatchObject({ max_results: 3 });
  });
});
