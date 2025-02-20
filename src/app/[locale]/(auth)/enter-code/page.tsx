import Link from 'next/link';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';

import { EnterCodeForm } from '@/app/components/Forms/EnterCodeForm';
import { PropsWihLocale } from '@/app/lib/types/types';
import { Toast } from '@/app/components/Toast';
import { Logo } from '@/app/components/Logo';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('enter-code.title'),
  };
}

export default function EnterCodePage({ params: { locale } }: PropsWihLocale) {
  setRequestLocale(locale);
  const tsu = useTranslations('sign-up');

  return (
    <div className="flex min-h-screen flex-1">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div>
            <Logo className="h-16" disableLink />
          </div>

          <div className="mt-8">
            <EnterCodeForm />
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
          src="/assets/documents_4.jpeg"
          fill
          alt=""
        />
      </div>
      <Toast />
    </div>
  );
}
