import { GetProjectMcpProvidersService } from './get-project-mcp-providers.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('GetProjectMcpProvidersService', () => {
  it('returns the enabled providers when no organizationId scoping is requested', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ enabledMcpProviders: ['CLICKUP'] });
    const prisma = {
      client: { projectSettings: { findUnique } },
    } as unknown as PrismaService;
    const service = new GetProjectMcpProvidersService(prisma);

    const result = await service.getProjectMcpProviders('proj-1');
    expect(result).toEqual(['CLICKUP']);
  });

  it('returns an empty array when no ProjectSettings row exists', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      client: { projectSettings: { findUnique } },
    } as unknown as PrismaService;
    const service = new GetProjectMcpProvidersService(prisma);

    expect(await service.getProjectMcpProviders('proj-1')).toEqual([]);
  });

  it('returns an empty array when organizationId scoping does not match the project', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const findUnique = jest.fn();
    const prisma = {
      client: {
        project: { findFirst },
        projectSettings: { findUnique },
      },
    } as unknown as PrismaService;
    const service = new GetProjectMcpProvidersService(prisma);

    const result = await service.getProjectMcpProviders('proj-1', 'org-1');
    expect(result).toEqual([]);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('proceeds to read ProjectSettings when the project belongs to the org', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'proj-1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ enabledMcpProviders: ['SLACK'] });
    const prisma = {
      client: {
        project: { findFirst },
        projectSettings: { findUnique },
      },
    } as unknown as PrismaService;
    const service = new GetProjectMcpProvidersService(prisma);

    const result = await service.getProjectMcpProviders('proj-1', 'org-1');
    expect(result).toEqual(['SLACK']);
  });
});
