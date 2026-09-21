/**
 * Disabling a catalogue entry has to stop the connectors already using it.
 *
 * The lookup used to resolve the definition only to read `authBaseUrl` off
 * it, and carried on with the stored row when there was none — so an entry an
 * operator disabled kept serving every connector that had been made from it
 * while the panel said it was off.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnector: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));

vi.mock('@/generated/prisma/client', () => ({
  McpConnectorStatus: { CONNECTED: 'CONNECTED', PENDING: 'PENDING' },
}));

const resolveConnectorDefinitionQuery = vi.fn();
vi.mock('../get-connector-definitions-query', () => ({
  resolveConnectorDefinitionQuery: (...a: unknown[]) =>
    resolveConnectorDefinitionQuery(...a) as unknown,
}));

const { getConnectorQuery } = await import('../get-connector-query');

const connected = {
  mcpServerUrl: 'https://mcp.example.test/mcp',
  customerId: 'org-1:user-1:notion',
  enabled: true,
  status: 'CONNECTED',
};

describe('getConnectorQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(connected);
    resolveConnectorDefinitionQuery.mockResolvedValue({
      provider: 'notion',
      authBaseUrl: 'https://api.example.test',
    });
  });

  it('resolves a connector whose catalogue entry is enabled', async () => {
    await expect(
      getConnectorQuery('org-1', 'user-1', 'notion'),
    ).resolves.toEqual({
      mcpServerUrl: 'https://mcp.example.test/mcp',
      customerId: 'org-1:user-1:notion',
      baseUrl: 'https://api.example.test',
    });
  });

  it('answers with nothing once the entry is disabled', async () => {
    resolveConnectorDefinitionQuery.mockResolvedValue(undefined);

    await expect(
      getConnectorQuery('org-1', 'user-1', 'notion'),
    ).resolves.toBeNull();
  });

  it('falls back to the stored URL when the entry carries no auth base', async () => {
    resolveConnectorDefinitionQuery.mockResolvedValue({
      provider: 'notion',
      authBaseUrl: undefined,
    });

    await expect(
      getConnectorQuery('org-1', 'user-1', 'notion'),
    ).resolves.toMatchObject({ baseUrl: 'https://mcp.example.test' });
  });

  it('answers with nothing for a connector that is not connected', async () => {
    findUnique.mockResolvedValue({ ...connected, status: 'PENDING' });

    await expect(
      getConnectorQuery('org-1', 'user-1', 'notion'),
    ).resolves.toBeNull();
  });
});
