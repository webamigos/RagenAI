import 'server-only';

import type { ThreadRetentionDays } from '@ragenai/platform-contracts';

import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { assertCanManageOrganizationSettings } from '@/features/subscriptions/services/feature-guards';
import { requireOrgAdmin } from '@/lib/auth-guards';
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
 * - **No schedule is registered here.** The worker registers the daily run
 *   itself at boot (`RECURRING_SCHEDULES` in apps/worker), on every install,
 *   and the job does nothing for an organization without a period — so
 *   storing the period is all it takes for the panel's "runs daily" to be
 *   true.
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
