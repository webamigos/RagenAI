import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

import { ForgotPasswordForm } from '@/app/components/Forms/ForgotPasswordForm';
import { PropsWihLocale } from '@/app/lib/types/types';
import { Logo } from '@/app/components/Logo';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('forgot-password.title'),
  };
}

export default async function ForgotPasswordPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tsu = await getTranslations('sign-up');

  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Logo className="h-16" disableLink />
          </div>
          <h2 className="mt-8 text-2xl/9 font-bold tracking-tight  dark:text-gray-300 text-gray-900">
            {tsu('forgot-password')}
          </h2>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>

          <div className="mt-12">
            <p className="mt-2 text-sm/6 dark:text-gray-300 text-gray-500">
              {tsu('Already-have-an-account')}{' '}
              <Link
                href="/sign-in"
                className="font-semibold dark:text-indigo-400 text-indigo-600 hover:text-indigo-500"
              >
                {tsu('sign-in')}
              </Link>
            </p>
          </div>
        </div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <Image
          className="absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
          src="/assets/documents_3.png"
          fill
          alt=""
        />
      </div>
    </div>
  );
}
