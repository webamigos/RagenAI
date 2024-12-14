import { useTranslations } from 'next-intl';

import { Link } from '@ragenai/common-ui';

export const NotFound = () => {
  const t = useTranslations('page404');
  return (
    <main className="bg-dark grid h-full min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <p className="text-base font-semibold text-black">404</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-300 sm:text-5xl">
          {t('page-not-found')}
        </h1>
        <p className="mt-6 text-base leading-7 text-gray-900 dark:text-gray-300">
          {t('sorry-we-could-not-find')}
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link href="/">{t('go-back-home')}</Link>
        </div>
      </div>
    </main>
  );
};
