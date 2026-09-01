import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { logger } from '@/app/lib/utils/logger';

/**
 * Lightweight check that ensures onboarding is complete.
 * Only runs finalizeOnboardingCommand if activeOrganizationId is missing.
 * This handles the OAuth sign-up flow where the user lands on the panel
 * without having gone through the account-configuration page.
 */
export async function ensureOnboardingComplete() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return;
    }

    const activeOrgId = (session.session as any)?.activeOrganizationId;
    if (activeOrgId) {
      return;
    }

    logger.info(
      { userId: session.user.id },
      'No activeOrganizationId on session, running onboarding finalization',
    );

    const { finalizeOnboardingCommand } =
      await import('./finalize-onboarding-command');
    await finalizeOnboardingCommand();
  } catch (error) {
    logger.error(
      { err: error },
      'Error in ensureOnboardingComplete (non-fatal)',
    );
  }
}
