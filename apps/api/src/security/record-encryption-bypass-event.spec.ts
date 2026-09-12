import { recordEncryptionBypassEvent } from './record-encryption-bypass-event.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('recordEncryptionBypassEvent', () => {
  it('writes a critical security event', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      client: { securityEvent: { create } },
    } as unknown as PrismaService;

    await recordEncryptionBypassEvent(prisma);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ENCRYPTION_REQUIREMENT_BYPASSED',
        severity: 'critical',
        source: 'infra',
      }),
    });
  });

  it('never throws when the write fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const prisma = {
      client: { securityEvent: { create } },
    } as unknown as PrismaService;

    await expect(recordEncryptionBypassEvent(prisma)).resolves.toBeUndefined();
  });
});
