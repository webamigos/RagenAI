import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  adapter: vi.fn(),
  prune: vi.fn(),
  options: { plugins: [] },
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: { $transaction: mocks.transaction },
}));
vi.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: mocks.adapter,
}));
vi.mock('../mcp-oauth-config', () => ({
  mcpOAuthPlugins: () => mocks.options.plugins,
}));
vi.mock('../prune-unused-mcp-clients', () => ({
  pruneUnusedMcpClients: mocks.prune,
}));
import { runMcpClientMaintenance } from '../run-mcp-client-maintenance';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe('MCP client maintenance runner', () => {
  it('does nothing with the deployment gate off', async () => {
    vi.stubEnv('MCP_OAUTH_ENABLED', 'false');
    expect(await runMcpClientMaintenance()).toEqual({
      disabled: true,
      deleted: 0,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('uses the provider schema and a serializable transaction', async () => {
    vi.stubEnv('MCP_OAUTH_ENABLED', 'true');
    const transaction = { id: 'transaction' },
      adapter = { id: 'adapter' };
    const initialize = vi.fn().mockReturnValue(adapter);
    mocks.adapter.mockReturnValue(initialize);
    mocks.prune.mockResolvedValue({ deleted: 1 });
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    const now = new Date('2026-10-06T00:00:00Z');
    expect(await runMcpClientMaintenance(now)).toEqual({ deleted: 1 });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(mocks.adapter).toHaveBeenCalledWith(transaction, {
      provider: 'postgresql',
      transaction: false,
    });
    expect(initialize).toHaveBeenCalledWith(mocks.options);
    expect(mocks.prune).toHaveBeenCalledWith(adapter, now);
  });
  it('retries serialization conflicts within a bounded budget', async () => {
    vi.stubEnv('MCP_OAUTH_ENABLED', 'true');
    mocks.transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValueOnce({ deleted: 2 });
    expect(await runMcpClientMaintenance()).toEqual({ deleted: 2 });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });
  it.each(['P2034', 'P2002'])(
    'propagates a persistent or unrelated failure (%s)',
    async (code) => {
      vi.stubEnv('MCP_OAUTH_ENABLED', 'true');
      mocks.transaction.mockRejectedValue({ code });
      await expect(runMcpClientMaintenance()).rejects.toEqual({ code });
      expect(mocks.transaction).toHaveBeenCalledTimes(code === 'P2034' ? 3 : 1);
    },
  );
});
