import { AuditLogService } from './audit-log.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('AuditLogService', () => {
  function makeService(create?: jest.Mock) {
    const auditLogCreate = create ?? jest.fn().mockResolvedValue({});
    const prisma = {
      client: { auditLog: { create: auditLogCreate } },
    } as unknown as PrismaService;
    return { service: new AuditLogService(prisma), auditLogCreate };
  }

  // track() is fire-and-forget (void return); await a macrotask so the
  // internal promise chain settles before asserting.
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('writes an audit log row scoped to the given org/user', async () => {
    const { service, auditLogCreate } = makeService();

    service.track({
      orgId: 'org-1',
      userId: 'user-1',
      action: 'project.created',
      entityType: 'project',
      entityId: 'proj-1',
      newData: { title: 'My project' },
    });
    await flush();

    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        action: 'project.created',
        entityType: 'project',
        entityId: 'proj-1',
        newData: { title: 'My project' },
      }),
    });
  });

  it('redacts sensitive fields in oldData/newData', async () => {
    const { service, auditLogCreate } = makeService();

    service.track({
      orgId: 'org-1',
      userId: 'user-1',
      action: 'settings.updated',
      entityType: 'organizationSettings',
      newData: { openaiApiKey: 'sk-secret', model: 'gpt-5.4' },
    });
    await flush();

    const call = auditLogCreate.mock.calls[0][0] as {
      data: { newData: Record<string, unknown> };
    };
    expect(call.data.newData).toEqual({
      openaiApiKey: '[REDACTED]',
      model: 'gpt-5.4',
    });
  });

  it('adds _impersonatedBy to newData when set', async () => {
    const { service, auditLogCreate } = makeService();

    service.track({
      orgId: 'org-1',
      userId: 'admin-1',
      impersonatedBy: 'admin-1',
      action: 'project.created',
      entityType: 'project',
      newData: { title: 'X' },
    });
    await flush();

    const call = auditLogCreate.mock.calls[0][0] as {
      data: { newData: Record<string, unknown> };
    };
    expect(call.data.newData._impersonatedBy).toBe('admin-1');
  });

  it('skips writing when orgId is missing', async () => {
    const { service, auditLogCreate } = makeService();

    service.track({
      orgId: '',
      action: 'project.created',
      entityType: 'project',
    });
    await flush();

    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('never throws even when the DB write fails', async () => {
    const { service } = makeService(
      jest.fn().mockRejectedValue(new Error('db down')),
    );

    expect(() =>
      service.track({
        orgId: 'org-1',
        action: 'project.created',
        entityType: 'project',
      }),
    ).not.toThrow();
    await flush();
  });
});
