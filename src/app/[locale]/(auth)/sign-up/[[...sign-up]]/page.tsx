import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';

import { RegisterForm } from '@/app/components/Forms/';
import { PropsWihLocale } from '@/app/lib/types/types';
import { Logo } from '@/app/components/Logo';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-up.title'),
  };
}

export default function SignUpPage() {
  const t = useTranslations('sign-up');
  return (
    <>
      <div className="flex min-h-full flex-1">
        <div className="flex flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
          <div className="mx-auto w-full max-w-sm lg:w-96">
            <div>
              <Logo className="h-16" disableLink />
              <h2 className="mt-8 text-2xl/9 font-bold tracking-tight dark:text-gray-300 text-gray-900">
                {t('create-account')}
              </h2>
              <p className="mt-2 text-sm/6 dark:text-gray-300 text-gray-500">
                {t('Already-have-an-account')}{' '}
                <Link
                  href="/sign-in"
                  className="font-semibold dark:text-indigo-400 text-indigo-600 hover:text-indigo-500"
                >
                  {t('sign-in')}
                </Link>
              </p>
            </div>

            <div className="mt-8">
              <RegisterForm />

              <SocialAuthOptions isSignUp={false} />
            </div>
          </div>
        </div>
        <div className="relative hidden w-0 flex-1 lg:block lg:justify-end">
          <Image
            className="absolute inset-0 size-full object-cover h-full ml-8 dark:opacity-10 opacity-20"
            src="/assets/robot-4.png"
            alt=""
            width={800}
            height={600}
          />
        </div>
      </div>
    </>
  );
}
