import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    securityEvent: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resolveSecurityEventCommand } from '../services/commands/resolve-security-event-command';

describe('resolveSecurityEventCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves an unresolved event and records resolvedBy + resolvedAt', async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      organizationId: 'org-1',
      resolvedAt: null,
    });
    mockUpdate.mockResolvedValue({});

    const result = await resolveSecurityEventCommand({
      publicId: 'pub-1',
      resolvedBy: 'admin@example.com',
      organizationId: 'org-1',
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 1 });
    expect(updateArgs.data.resolvedBy).toBe('admin@example.com');
    expect(updateArgs.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('returns not_found when event does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await resolveSecurityEventCommand({
      publicId: 'missing',
      resolvedBy: 'admin@example.com',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('blocks cross-org resolve when org scope does not match', async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      organizationId: 'other-org',
      resolvedAt: null,
    });

    const result = await resolveSecurityEventCommand({
      publicId: 'pub-1',
      resolvedBy: 'admin@malicious.com',
      organizationId: 'my-org',
    });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('allows unscoped resolve from ragen-admin (no organizationId)', async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      organizationId: 'any-org',
      resolvedAt: null,
    });
    mockUpdate.mockResolvedValue({});

    const result = await resolveSecurityEventCommand({
      publicId: 'pub-1',
      resolvedBy: 'appadmin@webamigos.pl',
      // organizationId omitted — ragen-admin context
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns already_resolved without re-updating', async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      organizationId: 'org-1',
      resolvedAt: new Date('2026-04-10T00:00:00Z'),
    });

    const result = await resolveSecurityEventCommand({
      publicId: 'pub-1',
      resolvedBy: 'admin@example.com',
      organizationId: 'org-1',
    });

    expect(result).toEqual({ ok: false, reason: 'already_resolved' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
