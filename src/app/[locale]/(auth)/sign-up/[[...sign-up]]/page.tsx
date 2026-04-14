import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

import { type PropsWihLocale } from '@/app/lib/types/types';
import { Logo } from '@/app/components/Logo';
import { SignUpContainer } from '@/app/components/Forms/RegisterForm/SignUpContainer';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-up.title'),
  };
}

type Props = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{ invitationId?: string }>;
};

export default async function SignUpPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { invitationId } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('sign-up');

  const signInHref = invitationId
    ? `/sign-in?invitationId=${encodeURIComponent(invitationId)}`
    : '/sign-in';

  return (
    <>
      <div className="flex min-h-screen flex-1">
        <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
          <div className="mx-auto w-full max-w-sm lg:w-96">
            <div>
              <Logo className="h-16" disableLink />
              <h2 className="mt-6 text-2xl/9 font-bold tracking-tight dark:text-gray-300 text-gray-900">
                {t('create-account')}
              </h2>
            </div>

            <div className="mt-6">
              <SignUpContainer
                forgotPasswordLabel={t('forgot-password')}
                alreadyHaveAccountLabel={t('Already-have-an-account')}
                signInLabel={t('sign-in')}
                signInHref={signInHref}
              />
            </div>
          </div>
        </div>
        <div className="relative hidden w-0 flex-1 border-l border-gray-200 dark:border-gray-700 lg:block">
          <Image
            className="pointer-events-none absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
            src="/assets/documents_2.jpeg"
            fill
            alt=""
          />
        </div>
      </div>
    </>
  );
}
