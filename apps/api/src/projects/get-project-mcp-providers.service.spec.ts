import { GetProjectMcpProvidersService } from './get-project-mcp-providers.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('GetProjectMcpProvidersService', () => {
  it('returns the enabled providers when no organizationId scoping is requested', async () => {
    const findUnique = vi
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
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = {
      client: { projectSettings: { findUnique } },
    } as unknown as PrismaService;
    const service = new GetProjectMcpProvidersService(prisma);

    expect(await service.getProjectMcpProviders('proj-1')).toEqual([]);
  });

  it('returns an empty array when organizationId scoping does not match the project', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findUnique = vi.fn();
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
    const findFirst = vi.fn().mockResolvedValue({ id: 'proj-1' });
    const findUnique = vi
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
