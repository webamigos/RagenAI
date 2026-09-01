import { type ConfigService } from '@nestjs/config';
import { RagenAppClient, RagenAppError } from './ragen-app.client.js';
import { type ApiContext } from '../types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../types/brand.js';

describe('RagenAppClient', () => {
  const baseUrl = 'http://ragen-app:3000';
  const internalSecret = 'test-secret';

  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  let client: RagenAppClient;

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'RAGEN_APP_INTERNAL_URL') {
          return baseUrl;
        }
        if (key === 'INTERNAL_API_SECRET') {
          return internalSecret;
        }
        throw new Error(`Unknown key: ${key}`);
      }),
    } as unknown as ConfigService;
    client = new RagenAppClient(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips x-project-id header when projectId is undefined on the context', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    // ApiContext without a projectId — org-scoped key case.
    const orgOnly = {
      orgId: context.orgId,
      userId: context.userId,
      keyId: context.keyId,
    } as unknown as typeof context;

    await client.request({
      method: 'POST',
      path: '/api/v1/example',
      context: orgOnly,
      body: {},
    });

    const init = fetchSpy.mock.calls[0][1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-org-id']).toBe('org-1');
    // Must NOT be the literal string "undefined" — just absent.
    expect(headers).not.toHaveProperty('x-project-id');
  });

  it('injects internal auth headers from context', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await client.request({
      method: 'POST',
      path: '/api/v1/example',
      context,
      body: { foo: 'bar' },
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/example`);
    expect(init!.method).toBe('POST');
    expect(init!.headers).toEqual(
      expect.objectContaining({
        'x-internal-secret': internalSecret,
        'x-org-id': 'org-1',
        'x-user-id': 'user-1',
        'x-project-id': 'proj-1',
        'Content-Type': 'application/json',
      }),
    );
    expect(init!.body).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('appends query params', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await client.request({
      method: 'GET',
      path: '/api/v1/example',
      context,
      query: { limit: 10, cursor: 'abc', skipped: undefined },
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/example?limit=10&cursor=abc`);
  });

  it('requestJson parses body on 2xx', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ hello: 'world' })));

    const result = await client.requestJson<{ hello: string }>({
      method: 'GET',
      path: '/api/v1/example',
      context,
    });
    expect(result).toEqual({ hello: 'world' });
  });

  it('requestJson throws RagenAppError on non-2xx with upstream status', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('boom', { status: 404 }));

    await expect(
      client.requestJson({
        method: 'GET',
        path: '/api/v1/example',
        context,
      }),
    ).rejects.toMatchObject({
      name: 'RagenAppError',
      status: 404,
      body: 'boom',
    });
  });

  it('RagenAppError carries status and body', () => {
    const e = new RagenAppError(500, 'upstream down');
    expect(e.status).toBe(500);
    expect(e.body).toBe('upstream down');
    expect(e).toBeInstanceOf(Error);
  });

  it('request passes through AbortError without wrapping', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

    await expect(
      client.request({
        method: 'GET',
        path: '/api/v1/example',
        context,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('request wraps connection errors with generic message', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      client.request({
        method: 'GET',
        path: '/api/v1/example',
        context,
      }),
    ).rejects.toThrow('Upstream service unavailable');
  });

  it('rawBody skips JSON serialization and does not force Content-Type', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    const formData = new FormData();
    formData.set('hello', 'world');

    await client.request({
      method: 'POST',
      path: '/api/v1/example',
      context,
      body: formData,
      rawBody: true,
    });

    const [, init] = fetchSpy.mock.calls[0];
    // FormData body is passed through untouched; fetch sets the multipart
    // Content-Type itself when we don't set one.
    expect(init!.body).toBe(formData);
    expect(init!.headers).not.toHaveProperty('Content-Type');
  });
});
