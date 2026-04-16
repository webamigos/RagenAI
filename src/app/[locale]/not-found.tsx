import { getLocale, getTranslations } from 'next-intl/server';

import { NotFoundLayout } from '../components/NotFound/NotFoundLayout';

export default async function NotFoundPage() {
  const [t, locale] = await Promise.all([
    getTranslations('page404'),
    getLocale(),
  ]);

  return (
    <NotFoundLayout
      title={t('page-not-found')}
      description={t('sorry-we-could-not-find')}
      backLabel={t('go-back-home')}
      homePath={`/${locale}`}
    />
  );
}
