import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getOrgIdFromAuthOrThrow: vi.fn(),
  requireOrgAdmin: vi.fn(),
  assertCanManageOrganizationSettings: vi.fn(),
  getThreadRetentionDays: vi.fn(),
  saveThreadRetentionDays: vi.fn(),
  upsertSchedule: vi.fn(),
  trackAudit: vi.fn(),
}));

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: mocks.getOrgIdFromAuthOrThrow,
}));

vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: mocks.requireOrgAdmin,
}));

vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageOrganizationSettings:
    mocks.assertCanManageOrganizationSettings,
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getThreadRetentionDays: mocks.getThreadRetentionDays,
  saveThreadRetentionDays: mocks.saveThreadRetentionDays,
}));

vi.mock('@/libs/jobs', () => ({
  jobs: () => ({ upsertSchedule: mocks.upsertSchedule }),
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({ trackAudit: mocks.trackAudit }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { THREAD_RETENTION_SCHEDULE } from '@ragenai/jobs';
import { UnauthorizedException } from '@/libs/utils/errors';

import { saveThreadRetentionCommand } from '../save-thread-retention-command';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrgIdFromAuthOrThrow.mockResolvedValue('org-session');
  mocks.requireOrgAdmin.mockResolvedValue({ role: 'admin' });
  mocks.assertCanManageOrganizationSettings.mockResolvedValue(undefined);
  mocks.getThreadRetentionDays.mockResolvedValue(null);
  mocks.saveThreadRetentionDays.mockResolvedValue(undefined);
  mocks.upsertSchedule.mockResolvedValue(undefined);
});

describe('saveThreadRetentionCommand', () => {
  it('saves a preset for the organization in the session', async () => {
    const result = await saveThreadRetentionCommand({
      threadRetentionDays: 90,
    });

    expect(result).toEqual({ success: true, threadRetentionDays: 90 });
    expect(mocks.requireOrgAdmin).toHaveBeenCalledWith('org-session');
    expect(mocks.saveThreadRetentionDays).toHaveBeenCalledWith(
      'org-session',
      90,
    );
  });

  // The organization is never the caller's to name: the schema refuses the
  // field, and nothing downstream sees anything but the session's.
  it('never takes the organization from the input', async () => {
    const result = await saveThreadRetentionCommand({
      threadRetentionDays: 30,
      organizationId: 'org-other',
    });

    expect(result).toEqual({ success: false, error: 'invalid-period' });
    expect(mocks.saveThreadRetentionDays).not.toHaveBeenCalled();
  });

  it('refuses a member, and changes nothing', async () => {
    mocks.requireOrgAdmin.mockRejectedValue(
      new Error('Unauthorized: org admin or owner role required'),
    );

    const result = await saveThreadRetentionCommand({
      threadRetentionDays: 30,
    });

    expect(result).toEqual({ success: false, error: 'forbidden' });
    expect(mocks.upsertSchedule).not.toHaveBeenCalled();
    expect(mocks.saveThreadRetentionDays).not.toHaveBeenCalled();
    expect(mocks.trackAudit).not.toHaveBeenCalled();
  });

  it('refuses an organization whose settings are locked', async () => {
    mocks.assertCanManageOrganizationSettings.mockRejectedValue(
      new UnauthorizedException('This organization cannot change its settings'),
    );

    const result = await saveThreadRetentionCommand({
      threadRetentionDays: 30,
    });

    expect(result).toEqual({ success: false, error: 'settings-locked' });
    expect(mocks.upsertSchedule).not.toHaveBeenCalled();
    expect(mocks.saveThreadRetentionDays).not.toHaveBeenCalled();
  });

  it.each([3, 31, '30', undefined])(
    'refuses %s before touching anything',
    async (days) => {
      const result = await saveThreadRetentionCommand({
        threadRetentionDays: days,
      });

      expect(result).toEqual({ success: false, error: 'invalid-period' });
      expect(mocks.requireOrgAdmin).not.toHaveBeenCalled();
      expect(mocks.saveThreadRetentionDays).not.toHaveBeenCalled();
    },
  );

  describe('the daily schedule', () => {
    // "Runs daily" has to be true on an installation where nobody ran the
    // worker's ensure script.
    it('registers it before storing a period', async () => {
      const order: string[] = [];
      mocks.upsertSchedule.mockImplementation(async () => {
        order.push('schedule');
      });
      mocks.saveThreadRetentionDays.mockImplementation(async () => {
        order.push('save');
      });

      await saveThreadRetentionCommand({ threadRetentionDays: 30 });

      expect(mocks.upsertSchedule).toHaveBeenCalledWith(
        THREAD_RETENTION_SCHEDULE,
      );
      expect(order).toEqual(['schedule', 'save']);
    });

    // A period with nothing to run it would read as active and delete
    // nothing.
    it('stores nothing when the schedule cannot be registered', async () => {
      mocks.upsertSchedule.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await saveThreadRetentionCommand({
        threadRetentionDays: 30,
      });

      expect(result).toEqual({
        success: false,
        error: 'schedule-unavailable',
      });
      expect(mocks.saveThreadRetentionDays).not.toHaveBeenCalled();
    });

    it('is not needed to turn retention off', async () => {
      mocks.getThreadRetentionDays.mockResolvedValue(90);
      mocks.upsertSchedule.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await saveThreadRetentionCommand({
        threadRetentionDays: null,
      });

      expect(result).toEqual({ success: true, threadRetentionDays: null });
      expect(mocks.upsertSchedule).not.toHaveBeenCalled();
      expect(mocks.saveThreadRetentionDays).toHaveBeenCalledWith(
        'org-session',
        null,
      );
    });
  });

  it('records the change, old and new, in the audit log', async () => {
    mocks.getThreadRetentionDays.mockResolvedValue(365);

    await saveThreadRetentionCommand({ threadRetentionDays: 30 });

    expect(mocks.trackAudit).toHaveBeenCalledWith({
      action: 'organization.thread-retention-updated',
      entityType: 'organization-settings',
      entityId: 'org-session',
      oldData: { threadRetentionDays: 365 },
      newData: { threadRetentionDays: 30 },
    });
  });

  it('reports a failed write instead of throwing', async () => {
    mocks.saveThreadRetentionDays.mockRejectedValue(new Error('db down'));

    const result = await saveThreadRetentionCommand({
      threadRetentionDays: 30,
    });

    expect(result).toEqual({ success: false, error: 'save-failed' });
    expect(mocks.trackAudit).not.toHaveBeenCalled();
  });
});
