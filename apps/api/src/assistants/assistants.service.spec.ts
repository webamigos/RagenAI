/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssistantsService } from './assistants.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';

describe('AssistantsService', () => {
  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-bound' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  const project = {
    id: 'proj-a',
    title: 'My Assistant',
    createdAt: new Date('2026-01-01Z'),
    settings: { instructions: 'Be helpful' },
  };

  function makeService(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const projectOps = {
      findMany: jest.fn().mockResolvedValue([project]),
      findFirst: jest.fn().mockResolvedValue(project),
      create: jest.fn().mockResolvedValue(project),
      update: jest.fn().mockResolvedValue(project),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...overrides,
    };
    const prisma = {
      client: {
        project: projectOps,
        organizationSettings: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ model: 'gpt-5.4', temperature: 0.5 }),
        },
      },
    } as unknown as PrismaService;
    return { service: new AssistantsService(prisma), prisma, projectOps };
  }

  it('list: scopes by org, paginates by cursor, applies order', async () => {
    const { service, projectOps } = makeService();
    await service.list(context, {
      limit: 10,
      order: 'asc',
      after: 'asst-cursor-id',
    });
    const call = projectOps.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: 'org-1' });
    expect(call.take).toBe(10);
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
    expect(call.cursor).toEqual({ id: 'cursor-id' });
    expect(call.skip).toBe(1);
  });

  it('list: returns OpenAI envelope with asst- prefix', async () => {
    const { service } = makeService();
    const out = await service.list(context, {});
    expect(out.object).toBe('list');
    expect(out.data[0].id).toBe('asst-proj-a');
    expect(out.data[0].model).toBe('gpt-5.4');
    expect(out.data[0].temperature).toBe(0.5);
  });

  it('get: strips prefix and scopes by org', async () => {
    const { service, projectOps } = makeService();
    const out = await service.get('asst-proj-a', context);
    expect(out.id).toBe('asst-proj-a');
    const call = projectOps.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'proj-a', organizationId: 'org-1' });
  });

  it('get: throws NotFoundException when missing', async () => {
    const { service } = makeService({
      findFirst: jest.fn().mockResolvedValue(null),
    });
    await expect(service.get('asst-missing', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create: persists title and instructions nested-write', async () => {
    const { service, projectOps } = makeService();
    await service.create(
      { name: 'New Assistant', instructions: 'Answer tersely.' },
      context,
    );
    const call = projectOps.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      title: 'New Assistant',
      organizationId: 'org-1',
      ownerId: 'user-1',
      settings: { create: { instructions: 'Answer tersely.' } },
    });
  });

  it('create: skips settings nested-write when instructions not provided', async () => {
    const { service, projectOps } = makeService();
    await service.create({ name: 'X' }, context);
    const call = projectOps.create.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('settings');
  });

  it('update: upserts instructions when provided, leaves title alone when not', async () => {
    const { service, projectOps } = makeService();
    await service.update(
      'asst-proj-a',
      { instructions: 'Be funnier' },
      context,
    );
    const call = projectOps.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('title');
    expect(call.data.settings).toEqual({
      upsert: {
        create: { instructions: 'Be funnier' },
        update: { instructions: 'Be funnier' },
      },
    });
  });

  it('update: updates title when provided', async () => {
    const { service, projectOps } = makeService();
    await service.update('asst-proj-a', { name: 'Renamed' }, context);
    const call = projectOps.update.mock.calls[0][0];
    expect(call.data.title).toBe('Renamed');
  });

  it('delete: refuses to delete the API key bound project', async () => {
    const { service } = makeService();
    await expect(
      service.remove('asst-proj-bound', context),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delete: returns assistant.deleted envelope', async () => {
    const { service } = makeService();
    const out = await service.remove('asst-proj-a', context);
    expect(out).toEqual({
      id: 'asst-proj-a',
      object: 'assistant.deleted',
      deleted: true,
    });
  });

  it('delete: throws NotFoundException when project missing', async () => {
    const { service } = makeService({
      findFirst: jest.fn().mockResolvedValue(null),
    });
    await expect(service.remove('asst-ghost', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('delete: throws NotFoundException on TOCTOU (findOrThrow passes but row gone)', async () => {
    // Simulates a concurrent delete landing between findOrThrow and
    // deleteMany — the count-based check should catch it.
    const { service } = makeService({
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    });
    await expect(service.remove('asst-proj-a', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
