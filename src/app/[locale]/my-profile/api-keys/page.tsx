import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

import { Card } from '@ragenai/common-ui/Card';

import { PropsWihLocale } from '@/app/lib/types/types';
import { Fallback } from '@/app/components/Fallback';
import { fetchApiKeys } from '@/app/components/ApiKeys/actions';
import { ApiKeysList } from '@/app/components/ApiKeys/ApiKeysList';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'api-keys' });

  return {
    title: t('title'),
  };
}

export default async function ApiKeysPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  const t = await getTranslations('api-keys');
  const result = await fetchApiKeys();

  if (!result.success) {
    return t('failed-to-load');
  }

  return (
    <Card title={t('title')} size="full" className="mb-5">
      <Suspense fallback={<Fallback />}>
        {result.payload && <ApiKeysList data={result.payload} />}
      </Suspense>
    </Card>
  );
}
