vi.mock('@better-auth/core/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@better-auth/core/context')>()),
  getCurrentAuthContext: mocks.context,
}));
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  state: vi.fn(),
  selection: vi.fn(),
}));
vi.mock('@better-auth/oauth-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@better-auth/oauth-provider')>()),
  getOAuthProviderState: mocks.state,
}));
vi.mock(
  '@/features/organizations/services/commands/mcp-selection-command',
  () => ({ getMcpSelection: mocks.selection }),
);
import { mcpOAuthPlugins } from '../mcp-oauth-config';
const provider = mcpOAuthPlugins({
  MCP_OAUTH_ENABLED: 'true',
  RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
})[1];
if (!provider || provider.id !== 'oauth-provider')
  throw new Error('Missing provider');
const checkpoint = provider.options.postLogin!.shouldRedirect;
const actor = {
  user: { id: 'user' } as never,
  session: { id: 'session' } as never,
  headers: new Headers(),
  scopes: [],
};
const signedAt = new Date('2026-10-06T00:00:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    request: new Request('https://auth.example/api/auth/oauth2/continue'),
  });
  mocks.state.mockResolvedValue({
    query: 'client_id=client',
    signedQueryIssuedAt: signedAt,
  });
});
it('requires selection for an unsigned fresh authorization', async () => {
  mocks.context.mockResolvedValue({
    request: new Request('https://auth.example/api/auth/oauth2/authorize'),
  });
  mocks.state.mockResolvedValue({ query: 'client_id=client' });
  expect(await checkpoint(actor)).toBe(true);
  expect(mocks.selection).not.toHaveBeenCalled();
});
it('does not reuse a selection on a fresh authorization', async () => {
  mocks.context.mockResolvedValue({
    request: new Request('https://auth.example/api/auth/oauth2/authorize'),
  });
  mocks.selection.mockResolvedValue({
    createdAt: new Date(signedAt.getTime() - 1),
  });
  expect(await checkpoint(actor)).toBe(true);
});
it('continues after a valid selection made in this signed flow', async () => {
  mocks.selection.mockResolvedValue({
    createdAt: new Date(signedAt.getTime() + 1),
  });
  expect(await checkpoint(actor)).toBe(false);
  expect(mocks.selection).toHaveBeenCalledWith(
    { userId: 'user', sessionId: 'session' },
    'client',
  );
});
it('requires selection again when live permissions refuse the stored selection', async () => {
  mocks.selection.mockRejectedValue(new Error('Access removed'));
  expect(await checkpoint(actor)).toBe(true);
});
