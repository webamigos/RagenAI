'use client';

import { useTranslations } from 'next-intl';

import { NotFoundLayout } from '../components/NotFound/NotFoundLayout';

export default function NotFoundPage() {
  const t = useTranslations('page404');

  return (
    <NotFoundLayout
      title={t('page-not-found')}
      description={t('sorry-we-could-not-find')}
      backLabel={t('go-back-home')}
    />
  );
}
