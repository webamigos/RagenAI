import Image from 'next/image';
import { redirect as nextRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

import { type PropsWihLocale } from '@/app/lib/types/types';
import { Logo } from '@/app/components/Logo';
import { SetupChecklist, SetupScreen } from '@/app/components/SetupChecklist';
import { getSetupStatusQuery } from '@/features/setup/services/queries/get-setup-status-query';
import { InitialAccountForm } from './InitialAccountForm';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('initial-account.title'),
  };
}

type Props = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function InitialAccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Creating the first account writes to Postgres, so an unreachable database
  // has to be reported here rather than after the form is filled in.
  const setup = await getSetupStatusQuery();
  if (!setup.database.reachable) {
    return (
      <SetupScreen
        report={setup.report}
        databaseUnreachable
        databaseError={setup.database.message}
      />
    );
  }

  // `claimed`, not just `adminExists`: an install whose last admin was removed
  // must not offer this screen again. See features/setup/services/install-claim.
  if (setup.claimed || setup.adminExists) {
    nextRedirect(`/${locale}/sign-in`);
  }

  const t = await getTranslations('initial-account');

  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div
          className={
            setup.report.findings.length > 0
              ? 'mx-auto w-full max-w-xl'
              : 'mx-auto w-full max-w-sm lg:w-96'
          }
        >
          <div>
            <Logo className="h-16" disableLink />
            <h2 className="mt-8 text-2xl/9 font-bold tracking-tight dark:text-gray-300 text-gray-900">
              {t('title')}
            </h2>
            <p className="mt-2 text-sm/6 dark:text-gray-300 text-gray-500">
              {t('intro')}
            </p>
            <p className="mt-2 text-sm/6 dark:text-gray-300 text-gray-500">
              {t('already-have-account')}{' '}
              <Link
                href="/sign-in"
                className="font-semibold dark:text-indigo-400 text-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                {t('sign-in')}
              </Link>
            </p>
          </div>

          {setup.report.findings.length > 0 && (
            <div className="mt-6">
              <SetupChecklist report={setup.report} />
            </div>
          )}

          <div className="mt-8">
            <InitialAccountForm />
          </div>
        </div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <Image
          className="pointer-events-none absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
          src="/assets/documents_2.jpeg"
          fill
          alt=""
        />
      </div>
    </div>
  );
}
