import { beforeEach, describe, expect, it, vi } from 'vitest';

const auditLogCreate = vi.fn();
const securityEventCreate = vi.fn();

vi.mock('../db', () => ({
  prisma: {
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    securityEvent: { create: (...a: unknown[]) => securityEventCreate(...a) },
  },
}));

const { recordAdminAction, ADMIN_ACTIONS } = await import('../audit');

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };
const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an organization-scoped action', () => {
  it('writes one AuditLog row attributed to the administrator', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.orgRenamed,
      entityType: 'organization',
      entityId: ORG_ID,
      organizationId: ORG_ID,
      before: { name: 'Old' },
      after: { name: 'New' },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG_ID,
      userId: ADMIN.id,
      action: 'admin.organization.renamed',
      entityType: 'organization',
      entityId: ORG_ID,
      oldData: { name: 'Old' },
      newData: { name: 'New' },
    });
  });

  it('raises no security event unless one is asked for', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.orgRenamed,
      entityType: 'organization',
      organizationId: ORG_ID,
    });

    expect(securityEventCreate).not.toHaveBeenCalled();
  });

  it('writes both when a security event is also asked for', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.orgLimitsChanged,
      entityType: 'organization',
      entityId: ORG_ID,
      organizationId: ORG_ID,
      securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
    });

    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(securityEventCreate).toHaveBeenCalledTimes(1);
    expect(securityEventCreate.mock.calls[0][0].data).toMatchObject({
      eventType: 'ADMIN_SETTINGS_CHANGED',
      severity: 'warn',
      source: 'admin',
      organizationId: ORG_ID,
    });
  });

  it('stores undefined rather than null for an absent before/after', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.orgRenamed,
      entityType: 'organization',
      organizationId: ORG_ID,
    });

    const { data } = auditLogCreate.mock.calls[0][0];
    expect(data.oldData).toBeUndefined();
    expect(data.newData).toBeUndefined();
  });
});

describe('a platform-scoped action', () => {
  it('writes a SecurityEvent with no organization', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.defaultLimitsChanged,
      entityType: 'settings',
      entityId: 'default_organization_limits',
      securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
    });

    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(securityEventCreate.mock.calls[0][0].data).toMatchObject({
      eventType: 'ADMIN_SETTINGS_CHANGED',
      source: 'admin',
      organizationId: null,
    });
  });

  it('defaults the severity to info', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.defaultModelsChanged,
      entityType: 'settings',
      securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
    });

    expect(securityEventCreate.mock.calls[0][0].data.severity).toBe('info');
  });

  it('names the administrator in the metadata, since the row has no author column', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.defaultModelsChanged,
      entityType: 'settings',
      securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
    });

    expect(securityEventCreate.mock.calls[0][0].data.metadata).toMatchObject({
      actorId: ADMIN.id,
      actorEmail: ADMIN.email,
      action: 'admin.defaults.models_changed',
    });
  });

  /**
   * `SecurityEvent.userId` is read everywhere else as "the account this
   * happened to". Pointing it at the administrator would make the security
   * view claim the admin was the subject of their own action.
   */
  it('sets userId to the subject when the entity is a user', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.userBanned,
      entityType: 'user',
      entityId: 'victim-1',
      securityEvent: { eventType: 'AUTH_ADMIN_ROLE_GRANTED' },
    });

    expect(securityEventCreate.mock.calls[0][0].data.userId).toBe('victim-1');
  });

  it('leaves userId null when the entity is not a user', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.defaultModelsChanged,
      entityType: 'settings',
      entityId: 'default_allowed_models',
      securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
    });

    expect(securityEventCreate.mock.calls[0][0].data.userId).toBeNull();
  });
});

describe('redaction', () => {
  it('never stores a credential handed to it', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.orgLimitsChanged,
      entityType: 'organization',
      organizationId: ORG_ID,
      before: { name: 'Acme', openaiApiKey: 'sk-live-secret' },
      after: { name: 'Acme', openaiApiKey: 'sk-live-rotated' },
    });

    const { data } = auditLogCreate.mock.calls[0][0];
    expect(data.oldData).toEqual({ name: 'Acme', openaiApiKey: '[REDACTED]' });
    expect(data.newData).toEqual({ name: 'Acme', openaiApiKey: '[REDACTED]' });
    expect(JSON.stringify(data)).not.toContain('sk-live');
  });

  it('redacts inside the security event metadata too', async () => {
    await recordAdminAction({
      admin: ADMIN,
      action: ADMIN_ACTIONS.defaultModelsChanged,
      entityType: 'settings',
      after: { litellmApiKey: 'sk-litellm-secret' },
      securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
    });

    const { metadata } = securityEventCreate.mock.calls[0][0].data;
    expect(metadata.after).toEqual({ litellmApiKey: '[REDACTED]' });
    expect(JSON.stringify(metadata)).not.toContain('sk-litellm-secret');
  });
});

describe('when nothing could be recorded', () => {
  /**
   * The failure mode this module exists to prevent is a silent one, so an
   * action that fits neither destination must be loud rather than a no-op.
   */
  it('throws rather than dropping the entry', async () => {
    await expect(
      recordAdminAction({
        admin: ADMIN,
        action: 'admin.something.unscoped',
        entityType: 'mystery',
      }),
    ).rejects.toThrow(/nothing would be recorded/);

    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(securityEventCreate).not.toHaveBeenCalled();
  });

  // Awaited rather than fire-and-forget: if the trail cannot be written, the
  // action that would have gone unrecorded should fail too.
  it('propagates a database failure to the caller', async () => {
    auditLogCreate.mockRejectedValue(new Error('db down'));

    await expect(
      recordAdminAction({
        admin: ADMIN,
        action: ADMIN_ACTIONS.orgRenamed,
        entityType: 'organization',
        organizationId: ORG_ID,
      }),
    ).rejects.toThrow('db down');
  });
});

describe('ADMIN_ACTIONS', () => {
  const names = Object.values(ADMIN_ACTIONS);

  it('is not empty', () => {
    expect(names.length).toBeGreaterThan(20);
  });

  // The Activity Log builds its filter dropdown from `groupBy(['action'])`, so
  // two names differing by a typo become two categories nobody can reconcile.
  it('has no duplicate', () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(names)('%s is namespaced and lower_snake', (name) => {
    expect(name).toMatch(/^admin(\.[a-z0-9_]+)+$/);
  });
});
