import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  query: vi.fn(),
  save: vi.fn(),
  selection: vi.fn(),
  handler: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({ cookie: 'session=test', origin: 'http://app.example' }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth', () => ({
  auth: {
    handler: mocks.handler,
    $context: Promise.resolve({ baseURL: 'http://app.example/api/auth' }),
  },
}));
vi.mock('@/lib/auth-guards', () => ({ getSessionOrThrow: mocks.session }));
vi.mock('@/lib/mcp-connect-flow', () => ({ verifiedMcpQuery: mocks.query }));
vi.mock(
  '@/features/organizations/services/commands/mcp-selection-command',
  () => ({ saveMcpSelection: mocks.save, getMcpSelection: mocks.selection }),
);
import { chooseMcpWorkspace, consentToMcp } from '../actions';
describe('MCP connect server actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      session: { id: 'session-a' },
      user: { id: 'user-a' },
    });
    mocks.query.mockResolvedValue({ clientId: 'client-a' });
    mocks.handler.mockResolvedValue(
      Response.json({ url: '/en/connect/consent?signed=1' }),
    );
  });
  it('binds choices to the authenticated actor and continues only with the signed query', async () => {
    const form = new FormData();
    form.set('organizationId', 'org-a');
    form.set('projectId', 'project-a');
    form.set('userId', 'attacker');
    await chooseMcpWorkspace('signed-query', form);
    expect(mocks.save).toHaveBeenCalledWith(
      { sessionId: 'session-a', userId: 'user-a' },
      'client-a',
      'org-a',
      'project-a',
    );
    const request = mocks.handler.mock.calls[0][0] as Request;
    expect(request.url).toBe('http://app.example/api/auth/oauth2/continue');
    expect(await request.json()).toEqual({
      postLogin: true,
      oauth_query: 'signed-query',
    });
    expect(mocks.redirect).toHaveBeenCalledWith('/en/connect/consent?signed=1');
  });
  it('refuses an invalid signature after authenticating and before saving anything', async () => {
    mocks.query.mockRejectedValue(new Error('Invalid signature'));
    await expect(
      chooseMcpWorkspace('tampered', new FormData()),
    ).rejects.toThrow('Invalid signature');
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.handler).not.toHaveBeenCalled();
  });
  it('does not continue if the workspace authorization fails', async () => {
    mocks.save.mockRejectedValue(new Error('Denied'));
    await expect(
      chooseMcpWorkspace('signed-query', new FormData()),
    ).rejects.toThrow('Denied');
    expect(mocks.handler).not.toHaveBeenCalled();
  });
  it('checks the live selection before accepting consent', async () => {
    const form = new FormData();
    form.set('decision', 'accept');
    await consentToMcp('signed-query', form);
    expect(mocks.selection).toHaveBeenCalledWith(
      { sessionId: 'session-a', userId: 'user-a' },
      'client-a',
    );
    expect(await (mocks.handler.mock.calls[0][0] as Request).json()).toEqual({
      accept: true,
      oauth_query: 'signed-query',
    });
  });
  it('passes denial to the provider without granting a selection', async () => {
    const form = new FormData();
    form.set('decision', 'deny');
    await consentToMcp('signed-query', form);
    expect(mocks.selection).not.toHaveBeenCalled();
    expect(await (mocks.handler.mock.calls[0][0] as Request).json()).toEqual({
      accept: false,
      oauth_query: 'signed-query',
    });
  });
  it('does not redirect on a failed provider response', async () => {
    mocks.handler.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(consentToMcp('signed-query', new FormData())).rejects.toThrow(
      'could not be continued',
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
