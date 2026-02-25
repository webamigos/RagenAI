import Image from 'next/image';
import { redirect as nextRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

import { PropsWihLocale } from '@/app/lib/types/types';
import { Logo } from '@/app/components/Logo';
import { checkIfAdminExistsQuery } from '@/features/users/services/queries/initial-account-queries';
import { InitialAccountForm } from './InitialAccountForm';

export const dynamic = 'force-dynamic';

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

  const adminExists = await checkIfAdminExistsQuery();

  if (adminExists) {
    nextRedirect(`/${locale}/sign-in`);
  }

  const t = await getTranslations('initial-account');

  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Logo className="h-16" disableLink />
            <h2 className="mt-8 text-2xl/9 font-bold tracking-tight dark:text-gray-300 text-gray-900">
              {t('title')}
            </h2>
            <p className="mt-2 text-sm/6 dark:text-gray-300 text-gray-500">
              {t('already-have-account')}{' '}
              <Link
                href="/sign-in"
                className="font-semibold dark:text-indigo-400 text-indigo-600 hover:text-indigo-500"
              >
                {t('sign-in')}
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <InitialAccountForm />
          </div>
        </div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <Image
          className="absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
          src="/assets/documents_2.jpeg"
          fill
          alt=""
        />
      </div>
    </div>
  );
}
