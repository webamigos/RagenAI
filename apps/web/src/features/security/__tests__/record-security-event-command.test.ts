import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSecurityEventCreate = vi.fn();
const mockSecurityEventCount = vi.fn();
const mockSendSecurityAlertEmail = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    securityEvent: {
      create: (...args: unknown[]) => mockSecurityEventCreate(...args),
      count: (...args: unknown[]) => mockSecurityEventCount(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/app/emails/services/mailer', () => ({
  sendSecurityAlertEmail: (...args: unknown[]) =>
    mockSendSecurityAlertEmail(...args),
}));

import { recordSecurityEvent } from '../services/commands/record-security-event-command';

async function flushAsync() {
  // Let the fire-and-forget promise chain finish before assertions.
  await new Promise((resolve) => setTimeout(resolve, 10));
}

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

describe('recordSecurityEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecurityEventCount.mockResolvedValue(0);
    mockSecurityEventCreate.mockResolvedValue(buildEventRow());
  });

  it('inserts an event with scrubbed metadata', async () => {
    recordSecurityEvent({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      source: 'api',
      organizationId: 'org-1',
      userId: 'user-1',
      metadata: { password: 'hunter2', keyName: 'ci-token' },
    });

    await flushAsync();

    expect(mockSecurityEventCreate).toHaveBeenCalledTimes(1);
    const createCall = mockSecurityEventCreate.mock.calls[0][0];
    expect(createCall.data.metadata.password).toBe('[REDACTED]');
    expect(createCall.data.metadata.keyName).toBe('ci-token');
    expect(createCall.data.eventType).toBe('API_KEY_CREATED');
    expect(createCall.data.severity).toBe('info');
  });

  it('does not fire email for non-critical events', async () => {
    mockSecurityEventCreate.mockResolvedValue(
      buildEventRow({ severity: 'info' }),
    );

    recordSecurityEvent({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      source: 'api',
    });

    await flushAsync();

    expect(mockSendSecurityAlertEmail).not.toHaveBeenCalled();
  });

  it('fires email for critical events', async () => {
    mockSecurityEventCreate.mockResolvedValue(
      buildEventRow({ severity: 'critical' }),
    );

    recordSecurityEvent({
      eventType: 'CROSS_ORG_ACCESS_ATTEMPTED',
      severity: 'critical',
      source: 'auth',
      userId: 'user-1',
    });

    await flushAsync();

    expect(mockSendSecurityAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('fires email for warn events when SECURITY_ALERT_SEVERITY=warn', async () => {
    const originalEnv = process.env.SECURITY_ALERT_SEVERITY;
    process.env.SECURITY_ALERT_SEVERITY = 'warn';

    mockSecurityEventCreate.mockResolvedValue(
      buildEventRow({ severity: 'warn' }),
    );

    recordSecurityEvent({
      eventType: 'CROSS_ORG_ACCESS_ATTEMPTED',
      severity: 'warn',
      source: 'auth',
      userId: 'user-1',
    });

    await flushAsync();

    expect(mockSendSecurityAlertEmail).toHaveBeenCalledTimes(1);

    if (originalEnv === undefined) {
      delete process.env.SECURITY_ALERT_SEVERITY;
    } else {
      process.env.SECURITY_ALERT_SEVERITY = originalEnv;
    }
  });

  it('escalates severity to critical when burst threshold is reached', async () => {
    // AUTH_LOGIN_FAILED threshold is 10 in 60 minutes.
    // Simulate 9 prior events — the 10th (this one) should escalate.
    mockSecurityEventCount.mockResolvedValue(9);
    mockSecurityEventCreate.mockResolvedValue(
      buildEventRow({ severity: 'critical' }),
    );

    recordSecurityEvent({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'user-1',
    });

    await flushAsync();

    const createCall = mockSecurityEventCreate.mock.calls[0][0];
    expect(createCall.data.severity).toBe('critical');
    // Email fires because effective severity is critical
    expect(mockSendSecurityAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('does not escalate when below threshold', async () => {
    mockSecurityEventCount.mockResolvedValue(3); // below threshold of 10

    recordSecurityEvent({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'user-1',
    });

    await flushAsync();

    const createCall = mockSecurityEventCreate.mock.calls[0][0];
    expect(createCall.data.severity).toBe('info');
    expect(mockSendSecurityAlertEmail).not.toHaveBeenCalled();
  });

  it('does not escalate pre-auth events with no userId or IP', async () => {
    mockSecurityEventCount.mockResolvedValue(100); // way above any threshold

    recordSecurityEvent({
      eventType: 'API_INTERNAL_SECRET_MISMATCH',
      severity: 'warn',
      source: 'api',
      // no userId, no ipAddress
    });

    await flushAsync();

    // Skip escalation when there's no actor bucket
    expect(mockSecurityEventCount).not.toHaveBeenCalled();
    const createCall = mockSecurityEventCreate.mock.calls[0][0];
    expect(createCall.data.severity).toBe('warn');
  });

  it('escalates when the IP bucket crosses threshold even if the user bucket is empty', async () => {
    // Simulate attacker rotating user accounts from one IP:
    //   userId bucket = 0 (fresh account), ipAddress bucket = 9 (prior fails)
    // AUTH_LOGIN_FAILED threshold is 10. The IP count + 1 = 10 → escalate.
    mockSecurityEventCount.mockImplementation(({ where }) => {
      if ((where as Record<string, unknown>).userId) {
        return Promise.resolve(0);
      }
      if ((where as Record<string, unknown>).ipAddress) {
        return Promise.resolve(9);
      }
      return Promise.resolve(0);
    });

    recordSecurityEvent({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'new-user',
      ipAddress: '10.0.0.1',
    });

    await flushAsync();

    const createCall = mockSecurityEventCreate.mock.calls[0][0];
    expect(createCall.data.severity).toBe('critical');
  });

  it('escalates when the user bucket crosses threshold even if the IP bucket is empty', async () => {
    // Same test inverted: attacker rotates IPs for one account.
    mockSecurityEventCount.mockImplementation(({ where }) => {
      if ((where as Record<string, unknown>).userId) {
        return Promise.resolve(9);
      }
      if ((where as Record<string, unknown>).ipAddress) {
        return Promise.resolve(0);
      }
      return Promise.resolve(0);
    });

    recordSecurityEvent({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      source: 'auth',
      userId: 'user-1',
      ipAddress: '10.0.0.99',
    });

    await flushAsync();

    const createCall = mockSecurityEventCreate.mock.calls[0][0];
    expect(createCall.data.severity).toBe('critical');
  });

  it('never throws back to the caller even if Prisma fails', async () => {
    mockSecurityEventCreate.mockRejectedValue(new Error('DB down'));

    // Must not throw synchronously or via unhandled rejection
    expect(() => {
      recordSecurityEvent({
        eventType: 'API_KEY_CREATED',
        severity: 'info',
        source: 'api',
      });
    }).not.toThrow();

    await flushAsync();

    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('never throws back to the caller even if the mailer fails', async () => {
    mockSecurityEventCreate.mockResolvedValue(
      buildEventRow({ severity: 'critical' }),
    );
    mockSendSecurityAlertEmail.mockRejectedValue(new Error('Resend down'));

    expect(() => {
      recordSecurityEvent({
        eventType: 'CROSS_ORG_ACCESS_ATTEMPTED',
        severity: 'critical',
        source: 'auth',
        userId: 'user-1',
      });
    }).not.toThrow();

    await flushAsync();

    expect(mockLoggerError).toHaveBeenCalled();
  });
});
