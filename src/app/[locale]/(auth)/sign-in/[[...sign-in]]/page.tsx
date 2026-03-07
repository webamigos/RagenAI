import Image from 'next/image';
import { redirect as nextRedirect } from 'next/navigation';

import { getLocale, getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { Link } from '@/i18n/routing';

import { LoginForm } from '@/app/components/Forms/LoginForm';
import { Logo } from '@/app/components/Logo';
import { type PropsWihLocale } from '@/app/lib/types/types';
import { ForgotPasswordLink } from '@/app/components/Forms/ForgotPasswordLink';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-in.title'),
  };
}

type SignInPageProps = {
  searchParams: Promise<{ invitationId?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const user = await getCurrentUser();
  const t = await getTranslations('sign-in');
  const { invitationId } = await searchParams;

  if (user) {
    const locale = await getLocale();
    if (invitationId) {
      nextRedirect(
        `/${locale}/accept-invitation?token=${encodeURIComponent(invitationId)}`,
      );
    }
    nextRedirect(`/${locale}`);
  }

  const signUpHref = invitationId
    ? `/sign-up?invitationId=${encodeURIComponent(invitationId)}`
    : '/sign-up';

  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Logo className="h-16" disableLink />
            <h2 className="mt-8 text-2xl/9 font-bold tracking-tight  dark:text-gray-300 text-gray-900">
              {t('sign-in-to-account')}
            </h2>
            <p className="mt-2 text-sm/6 dark:text-gray-300 text-gray-500">
              {t('not-a-member')}{' '}
              <Link
                href={signUpHref}
                className="font-semibold dark:text-indigo-400 text-indigo-600 hover:text-indigo-500"
              >
                {t('start-free-trial')}
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <LoginForm />

            <ForgotPasswordLink label={t('forgot-password')} />
          </div>
        </div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <Image
          className="absolute inset-0 w-full h-full object-cover dark:opacity-20 opacity-30"
          src="/assets/documents_1.jpeg"
          fill
          alt=""
        />
      </div>
    </div>
  );
}
