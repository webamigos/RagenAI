import { GetEnabledConnectorsService } from './get-enabled-connectors.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { McpConnectorStatus } from '../generated/prisma/client.js';

describe('GetEnabledConnectorsService', () => {
  it('queries for enabled + connected connectors scoped to org and user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      client: { mcpConnector: { findMany } },
    } as unknown as PrismaService;
    const service = new GetEnabledConnectorsService(prisma);

    await service.getEnabledConnectors('org-1', 'user-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'user-1',
        enabled: true,
        status: McpConnectorStatus.CONNECTED,
      },
      select: {
        id: true,
        provider: true,
        mcpServerUrl: true,
        customerId: true,
        organizationId: true,
        userId: true,
      },
    });
  });

  it('returns the connectors found', async () => {
    const connectors = [{ id: '1', provider: 'CLICKUP' }];
    const findMany = jest.fn().mockResolvedValue(connectors);
    const prisma = {
      client: { mcpConnector: { findMany } },
    } as unknown as PrismaService;
    const service = new GetEnabledConnectorsService(prisma);

    const result = await service.getEnabledConnectors('org-1', 'user-1');
    expect(result).toBe(connectors);
  });

  it('rethrows on Prisma failure', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('DB down'));
    const prisma = {
      client: { mcpConnector: { findMany } },
    } as unknown as PrismaService;
    const service = new GetEnabledConnectorsService(prisma);

    await expect(
      service.getEnabledConnectors('org-1', 'user-1'),
    ).rejects.toThrow('DB down');
  });
});
