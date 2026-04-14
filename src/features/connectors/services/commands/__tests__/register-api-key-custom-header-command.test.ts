import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsert = vi.fn();
const mockStoreToken = vi.fn();
const mockDeleteToken = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnector: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

vi.mock('@/libs/ragen-vault', () => ({
  ragenAuthClient: {
    storeToken: (...args: unknown[]) => mockStoreToken(...args),
    deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { registerApiKeyCustomHeaderCommand } from '../register-api-key-custom-header-command';
import { McpConnectorProvider } from '@/generated/prisma/client';

const credentials = {
  siteUrl: 'https://shop.example.com/',
  consumerKey: 'ck_abc',
  consumerSecret: 'cs_xyz',
};

describe('registerApiKeyCustomHeaderCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreToken.mockResolvedValue(undefined);
    mockDeleteToken.mockResolvedValue(undefined);
    mockUpsert.mockResolvedValue({
      id: 'conn-1',
      status: 'CONNECTED',
      connectedAt: new Date('2026-04-14'),
    });
  });

  it('normalizes the site URL, joins credentials, and stores the combined token', async () => {
    await registerApiKeyCustomHeaderCommand(
      'org-1',
      'user-1',
      McpConnectorProvider.WOOCOMMERCE,
      credentials,
    );

    expect(mockStoreToken).toHaveBeenCalledWith(
      'org-1:user-1:woocommerce',
      McpConnectorProvider.WOOCOMMERCE,
      { accessToken: 'ck_abc:cs_xyz', tokenType: 'CustomHeader' },
    );
  });

  it('upserts the connector with the computed MCP URL', async () => {
    await registerApiKeyCustomHeaderCommand(
      'org-1',
      'user-1',
      McpConnectorProvider.WOOCOMMERCE,
      credentials,
    );

    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.mcpServerUrl).toBe(
      'https://shop.example.com/wp-json/woocommerce/mcp',
    );
    expect(call.update.mcpServerUrl).toBe(
      'https://shop.example.com/wp-json/woocommerce/mcp',
    );
  });

  it('rejects providers that are not configured for custom-header auth', async () => {
    await expect(
      registerApiKeyCustomHeaderCommand(
        'org-1',
        'user-1',
        McpConnectorProvider.HUBSPOT,
        credentials,
      ),
    ).rejects.toThrow(/custom-header/);
    expect(mockStoreToken).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejects missing consumer key or secret', async () => {
    await expect(
      registerApiKeyCustomHeaderCommand(
        'org-1',
        'user-1',
        McpConnectorProvider.WOOCOMMERCE,
        { ...credentials, consumerKey: '  ' },
      ),
    ).rejects.toThrow(/required/);
  });

  it('rejects HTTP URLs via the normalizer', async () => {
    await expect(
      registerApiKeyCustomHeaderCommand(
        'org-1',
        'user-1',
        McpConnectorProvider.WOOCOMMERCE,
        { ...credentials, siteUrl: 'http://shop.example.com' },
      ),
    ).rejects.toThrow(/https/);
  });

  it('rolls back the vault token when the DB upsert fails', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('db down'));

    await expect(
      registerApiKeyCustomHeaderCommand(
        'org-1',
        'user-1',
        McpConnectorProvider.WOOCOMMERCE,
        credentials,
      ),
    ).rejects.toThrow(/db down/);

    expect(mockStoreToken).toHaveBeenCalledTimes(1);
    expect(mockDeleteToken).toHaveBeenCalledWith(
      'org-1:user-1:woocommerce',
      McpConnectorProvider.WOOCOMMERCE,
    );
  });

  it('swallows vault-rollback failures and still surfaces the DB error', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('db down'));
    mockDeleteToken.mockRejectedValueOnce(new Error('vault down'));

    await expect(
      registerApiKeyCustomHeaderCommand(
        'org-1',
        'user-1',
        McpConnectorProvider.WOOCOMMERCE,
        credentials,
      ),
    ).rejects.toThrow(/db down/);
  });
});
