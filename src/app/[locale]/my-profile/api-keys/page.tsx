import type { Metadata } from 'next';

import { Card } from '@salesyy/common-ui/Card';
import { getTranslations } from 'next-intl/server';
import { PropsWihLocale } from '@/app/lib/types/types';
import { ApiKeysSynchronizer } from '@/app/components/ApiKeys/ApiKeysSynchronizer';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'api-keys' });

  return {
    title: t('title'),
  };
}

export default async function ApiKeysPage() {
  const t = await getTranslations('api-keys');

  return (
    <Card title={t('title')} size="full" className="mb-5">
      <ApiKeysSynchronizer>
        <div>sth</div>
      </ApiKeysSynchronizer>
    </Card>
  );
}
