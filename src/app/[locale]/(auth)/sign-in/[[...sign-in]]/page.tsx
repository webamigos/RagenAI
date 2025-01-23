import { LoginForm } from '@/app/components/Forms/LoginForm';
import { Logo } from '@/app/components/Logo';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';
import { PropsWihLocale } from '@/app/lib/types/types';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-in.title'),
  };
}

// export default function SignInPage() {
//   return <LoginForm />;
// }

export default function SignInPage() {
  const t = useTranslations('sign-in');
  return (
    <>
      <div className="flex min-h-full flex-1 bg-white">
        <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
          <div className="mx-auto w-full max-w-sm lg:w-96">
            <div>
              <Logo className="h-16" />
              <h2 className="mt-8 text-2xl/9 font-bold tracking-tight text-gray-900">
                {t('sign-in-to-account')}
              </h2>
              <p className="mt-2 text-sm/6 text-gray-500">
                {t('not-a-member')}{' '}
                <Link
                  href="/sign-up"
                  className="font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  {t('start-free-trial')}
                </Link>
              </p>
            </div>

            <div className="mt-8">
              <div>
                <LoginForm />
              </div>

              <div className="mt-10">
                <div className="relative">
                  <div
                    className="absolute inset-0 flex items-center"
                    aria-hidden="true"
                  >
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm/6 font-medium">
                    <span className="bg-white px-6 text-gray-900">
                      {t('or-continue-with')}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <SocialAuthOptions isSignUp={false} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative hidden w-0 flex-1 lg:block lg:justify-end">
          <Image
            className="absolute inset-0 size-full object-cover h-full ml-8"
            src="/assets/robot-3.jpg"
            alt=""
            width={400}
            height={800}
          />
        </div>
      </div>
    </>
  );
}
