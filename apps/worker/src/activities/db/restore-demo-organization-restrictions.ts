import { DEMO_NIGHTLY_RESTORE } from '@ragenai/platform-contracts';

import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { DEMO_ORGANIZATION_ID } from '../../consts';

export type RestoreDemoOrganizationRestrictionsResult = {
  skipped: boolean;
  restored: boolean;
};

/**
 * Re-apply the demo organization's restrictions.
 *
 * The shared demo account holds the org-admin role, and the spec lists
 * "someone clears the flags on the demo org" as a failure mode with no lock:
 * the demo silently becomes writable and the next visitor can upload a real
 * document to a public account. This is the lock. It runs alongside the
 * thread cleanup, so the tenant is back to its seeded restrictions every
 * night regardless of what a visitor with that role changed during the day.
 *
 * The values come from `@ragenai/platform-contracts` (ADR-33), from
 * `DEMO_NIGHTLY_RESTORE` rather than the seed's `DEMO_ORGANIZATION_RESTRICTIONS`:
 * the flags are restored, the spend cap is not. A visitor cannot change the
 * cap — it is set from the admin panel — and the constant is a placeholder,
 * so writing it back would have overwritten the operator's own figure.
 *
 * Same target rule as `deleteStaleDemoThreads`: named by
 * `DEMO_ORGANIZATION_ID`, unset means skip. Rewriting an organization's
 * feature flags is not something to enable by accident either.
 */
export async function restoreDemoOrganizationRestrictions(): Promise<RestoreDemoOrganizationRestrictionsResult> {
  if (!DEMO_ORGANIZATION_ID) {
    logger.info(
      'Demo restrictions restore skipped: DEMO_ORGANIZATION_ID is not set. This is the expected state outside the demo environment.',
    );
    return { skipped: true, restored: false };
  }

  await db.restoreOrganizationRestrictions(
    DEMO_ORGANIZATION_ID,
    DEMO_NIGHTLY_RESTORE,
  );

  logger.info(
    {
      organizationId: DEMO_ORGANIZATION_ID,
      featureOverrides: DEMO_NIGHTLY_RESTORE.featureOverrides,
    },
    'Demo organization feature flags restored',
  );

  return { skipped: false, restored: true };
}
