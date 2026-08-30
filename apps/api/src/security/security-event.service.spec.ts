import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { SecurityEventService } from './security-event.service.js';

// Ported from ragen-app's
// src/features/security/__tests__/record-security-event-command.test.ts —
// the email-dispatch assertions are dropped (not ported, see the KNOWN GAP
// note in security-event.service.ts); DB/escalation/scrub behavior is kept.

function buildEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    publicId: 'evt-public-id',
    eventType: 'AUTH_LOGIN_FAILED',
    severity: 'info',
    source: 'auth',
    organizationId: null,
    userId: 'user-1',
    ipAddress: '10.0.0.1',
    userAgent: null,
    requestId: 'req-1',
    metadata: {},
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date('2026-04-11T12:00:00Z'),
    ...overrides,
  };
}

async function flushAsync() {
  // Let the fire-and-forget promise chain finish before assertions.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('SecurityEventService', () => {
  let service: SecurityEventService;
  let mockCreate: jest.Mock;
  let mockCount: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn().mockResolvedValue(buildEventRow());
    mockCount = jest.fn().mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityEventService,
        {
          provide: PrismaService,
          useValue: {
            client: {
              securityEvent: {
                create: (...args: unknown[]) =>
                  (mockCreate as (...a: unknown[]) => unknown)(...args),
                count: (...args: unknown[]) =>
                  (mockCount as (...a: unknown[]) => unknown)(...args),
              },
            },
          },
        },
      ],
    }).compile();

    service = module.get(SecurityEventService);
  });

  it('inserts an event with scrubbed metadata', async () => {
    service.record({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      source: 'api',
      organizationId: 'org-1',
      userId: 'user-1',
      metadata: { password: 'hunter2', keyName: 'ci-token' },
    });

    await flushAsync();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createCall = mockCreate.mock.calls[0][0] as {
      data: {
        metadata: Record<string, unknown>;
        eventType: string;
        severity: string;
      };
    };
    expect(createCall.data.metadata.password).toBe('[REDACTED]');
    expect(createCall.data.metadata.keyName).toBe('ci-token');
    expect(createCall.data.eventType).toBe('API_KEY_CREATED');
    expect(createCall.data.severity).toBe('info');
  });

  it('escalates severity to critical when burst threshold is reached', async () => {
    // AUTH_LOGIN_FAILED threshold is 10 in 60 minutes.
    // Simulate 9 prior events — the 10th (this one) should escalate.
    mockCount.mockResolvedValue(9);
    mockCreate.mockResolvedValue(buildEventRow({ severity: 'critical' }));

    service.record({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'user-1',
    });

    await flushAsync();

    const createCall = mockCreate.mock.calls[0][0] as {
      data: { severity: string };
    };
    expect(createCall.data.severity).toBe('critical');
  });

  it('does not escalate when below threshold', async () => {
    mockCount.mockResolvedValue(3); // below threshold of 10

    service.record({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'user-1',
    });

    await flushAsync();

    const createCall = mockCreate.mock.calls[0][0] as {
      data: { severity: string };
    };
    expect(createCall.data.severity).toBe('info');
  });

  it('does not escalate pre-auth events with no userId or IP', async () => {
    mockCount.mockResolvedValue(100); // way above any threshold

    service.record({
      eventType: 'API_INTERNAL_SECRET_MISMATCH',
      severity: 'warn',
      source: 'api',
      // no userId, no ipAddress
    });

    await flushAsync();

    // Skip escalation when there's no actor bucket
    expect(mockCount).not.toHaveBeenCalled();
    const createCall = mockCreate.mock.calls[0][0] as {
      data: { severity: string };
    };
    expect(createCall.data.severity).toBe('warn');
  });

  it('escalates when the IP bucket crosses threshold even if the user bucket is empty', async () => {
    // Simulate attacker rotating user accounts from one IP:
    //   userId bucket = 0 (fresh account), ipAddress bucket = 9 (prior fails)
    // AUTH_LOGIN_FAILED threshold is 10. The IP count + 1 = 10 → escalate.
    mockCount.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.userId) {
          return Promise.resolve(0);
        }
        if (where.ipAddress) {
          return Promise.resolve(9);
        }
        return Promise.resolve(0);
      },
    );

    service.record({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'new-user',
      ipAddress: '10.0.0.1',
    });

    await flushAsync();

    const createCall = mockCreate.mock.calls[0][0] as {
      data: { severity: string };
    };
    expect(createCall.data.severity).toBe('critical');
  });

  it('escalates when the user bucket crosses threshold even if the IP bucket is empty', async () => {
    mockCount.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.userId) {
          return Promise.resolve(9);
        }
        if (where.ipAddress) {
          return Promise.resolve(0);
        }
        return Promise.resolve(0);
      },
    );

    service.record({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'user-1',
      ipAddress: '10.0.0.99',
    });

    await flushAsync();

    const createCall = mockCreate.mock.calls[0][0] as {
      data: { severity: string };
    };
    expect(createCall.data.severity).toBe('critical');
  });

  it('never throws back to the caller even if Prisma fails', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'));

    // Must not throw synchronously
    expect(() => {
      service.record({
        eventType: 'API_KEY_CREATED',
        severity: 'info',
        source: 'api',
      });
    }).not.toThrow();

    await flushAsync();
  });
});
