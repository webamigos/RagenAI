'use server';

import { revalidatePath } from 'next/cache';
import {
  REGISTRATION_ENABLED_KEY,
  registrationIsEnabled,
  registrationSettingValue,
} from '@ragenai/platform-contracts';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { prisma } from '@/lib/db';

/**
 * Whether this installation lets people create their own account.
 *
 * The key, the default and the string parsing live in
 * `@ragenai/platform-contracts` because `apps/web` enforces the same setting
 * at sign-up and the two must not drift (ADR-33).
 */
export async function getRegistrationEnabledAction(): Promise<boolean> {
  await requireAdmin();

  const row = await prisma.settings.findUnique({
    where: { key: REGISTRATION_ENABLED_KEY },
    select: { value: true },
  });

  return registrationIsEnabled(row?.value);
}

/**
 * Opening registration is the moment an installation becomes reachable by
 * strangers, so it is audited like a permission change rather than a
 * preference — `before` and `after` both recorded, so the log answers who
 * opened it and when.
 */
export async function setRegistrationEnabledAction(
  enabled: boolean,
): Promise<boolean> {
  const admin = await requireAdmin();

  const existing = await prisma.settings.findUnique({
    where: { key: REGISTRATION_ENABLED_KEY },
    select: { value: true },
  });
  const wasEnabled = registrationIsEnabled(existing?.value);

  const value = registrationSettingValue(enabled);
  await prisma.settings.upsert({
    where: { key: REGISTRATION_ENABLED_KEY },
    create: { key: REGISTRATION_ENABLED_KEY, value },
    update: { value },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.registrationToggled,
    entityType: 'settings',
    entityId: REGISTRATION_ENABLED_KEY,
    before: { enabled: wasEnabled },
    after: { enabled },
    // Required, and not merely nice to have: this setting belongs to the
    // installation, not to an organization, so `AuditLog` cannot hold the row
    // and `recordAdminAction` throws rather than record nothing. Opening
    // registration is the moment strangers can reach this deployment, so it
    // is filed as a security event either way — `warn` on the way open,
    // because that is the direction worth finding in the incidents view.
    securityEvent: {
      eventType: 'ADMIN_SETTINGS_CHANGED',
      severity: enabled ? 'warn' : 'info',
    },
  });

  revalidatePath('/users');

  return enabled;
}
