import 'server-only';

import { THREAD_RETENTION_SCHEDULE } from '@ragenai/jobs';
import type { ThreadRetentionDays } from '@ragenai/platform-contracts';

import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { assertCanManageOrganizationSettings } from '@/features/subscriptions/services/feature-guards';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { jobs } from '@/libs/jobs';
import { UnauthorizedException } from '@/libs/utils/errors';

import {
  threadRetentionInputSchema,
  type SaveThreadRetentionResult,
} from '../../contracts/thread-retention.types';
import {
  getThreadRetentionDays,
  saveThreadRetentionDays,
} from '../organization-settings';

/**
 * Set the active organization's thread retention period (spec
 * 2026-10-17-ragen-as-an-on-premises-appliance, B4), or turn it off.
 *
 * - **The organization is the session's**, never the caller's: the input has
 *   no organization id to trust.
 * - **Owner or admin**, asked as a capability (`requireOrgAdmin` →
 *   `canManageOrg`), and the organization's `manageOrganizationSettings`
 *   gate, which a frozen organization (the demo) has off.
 * - **Turning it on registers the daily schedule** before the period is
 *   stored. The panel says the deletion runs daily, and that has to be true
 *   on an installation where nobody ran the worker's ensure script; a period
 *   saved with no schedule behind it would delete nothing while reading as
 *   active. The upsert is idempotent (one id, `THREAD_RETENTION_SCHEDULE`),
 *   so every save after the first is a no-op. If the job runtime cannot be
 *   reached the period is not saved, rather than saved and silently idle.
 *   Turning it off needs no runtime: the job does nothing for an
 *   organization without a period.
 *
 * The confirmation for enabling or shortening is the panel's; by the time a
 * request reaches here the person has confirmed it.
 */
export async function saveThreadRetentionCommand(
  input: unknown,
): Promise<SaveThreadRetentionResult> {
  const parsed = threadRetentionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invalid-period' };
  }
  const next = parsed.data.threadRetentionDays as ThreadRetentionDays | null;

  const orgId = await getOrgIdFromAuthOrThrow();

  try {
    await requireOrgAdmin(orgId);
  } catch {
    // Not logged again here: `requireOrgAdmin` records the refusal as a
    // security event, with the actor's role, before it throws.
    return { success: false, error: 'forbidden' };
  }

  try {
    await assertCanManageOrganizationSettings(orgId);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return { success: false, error: 'settings-locked' };
    }
    throw error;
  }

  const previous = await getThreadRetentionDays(orgId);

  if (next !== null) {
    try {
      await jobs().upsertSchedule(THREAD_RETENTION_SCHEDULE);
    } catch (error) {
      logger.error(
        {
          organizationId: orgId,
          scheduleId: THREAD_RETENTION_SCHEDULE.id,
          err: error instanceof Error ? error.message : String(error),
        },
        'Thread retention not saved: the daily schedule could not be registered',
      );
      return { success: false, error: 'schedule-unavailable' };
    }
  }

  try {
    await saveThreadRetentionDays(orgId, next);
  } catch (error) {
    logger.error(
      {
        organizationId: orgId,
        err: error instanceof Error ? error.message : String(error),
      },
      'Thread retention not saved',
    );
    return { success: false, error: 'save-failed' };
  }

  trackAudit({
    action: 'organization.thread-retention-updated',
    entityType: 'organization-settings',
    entityId: orgId,
    oldData: { threadRetentionDays: previous },
    newData: { threadRetentionDays: next },
  });

  logger.info(
    {
      organizationId: orgId,
      previousRetentionDays: previous,
      retentionDays: next,
    },
    'Thread retention updated',
  );

  return { success: true, threadRetentionDays: next };
}
