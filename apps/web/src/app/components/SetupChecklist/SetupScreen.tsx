import { useTranslations } from 'next-intl';

import { Logo } from '@/app/components/Logo';
import type { SetupReport } from '@/features/setup/contracts/types';

import { SetupChecklist } from './SetupChecklist';

type SetupScreenProps = {
  report: SetupReport;
  /**
   * The driver's own message. Present only outside production — see
   * DatabaseProbe. Without it the screen points at the server log instead.
   */
  databaseError?: string;
  /**
   * Whether to show the database panel. Separate from `databaseError` because
   * in production the probe reports the failure without a message, and the
   * panel still has to appear.
   */
  databaseUnreachable?: boolean;
};

/**
 * Full-page stand-in for the sign-in form when the install is too broken to
 * sign into. Without it the operator gets a Next.js error page and a stack
 * trace about a socket, which says nothing about which variable to set.
 */
export const SetupScreen = ({
  report,
  databaseError,
  databaseUnreachable = false,
}: SetupScreenProps) => {
  const t = useTranslations('setup');

  return (
    <div className="flex min-h-screen flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-20">
      <div className="mx-auto w-full max-w-2xl">
        <Logo className="h-16" disableLink />

        {databaseUnreachable && (
          <section
            aria-labelledby="setup-database-heading"
            className="mt-8 rounded-lg border border-destructive/40 bg-crimson-50 p-4"
          >
            <h2
              id="setup-database-heading"
              className="text-sm font-semibold text-destructive"
            >
              {t('database-unreachable-title')}
            </h2>
            <p className="mt-1 text-sm text-destructive">
              {t('database-unreachable-intro')}
            </p>
            {databaseError ? (
              <pre className="mt-2 overflow-x-auto rounded bg-crimson-50/70 p-2 text-xs text-destructive">
                {databaseError}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-destructive">
                {t('database-unreachable-see-logs')}
              </p>
            )}
          </section>
        )}

        <div className="mt-6">
          <SetupChecklist report={report} />
        </div>
      </div>
    </div>
  );
};
