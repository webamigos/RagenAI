import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

import { Card } from '@ragenai/common-ui/Card';

import { PropsWihLocale } from '@/app/lib/types/types';
import { Fallback } from '@/app/components/Fallback';
import { fetchApiKeys } from '@/app/components/ApiKeys/actions';
import { ApiKeysList } from '@/app/components/ApiKeys/ApiKeysList';
import { getDefaultProjectPublicId } from '@/app/actions';
import { Container } from '@ragenai/common-ui/Container';
import { Button, Header } from '@ragenai/common-ui';

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
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  if (!result.success) {
    return t('failed-to-load');
  }

  return (
    <Container size="full">
      <div className="flex w-full flex-wrap items-end justify-between gap-4 pb-6 dark:border-white/10">
        <Header showDivider={false}>{t('title')}</Header>
        <div className="flex gap-4">
          <Button href="/settings/api-keys/create">{t('create-key')}</Button>
        </div>
      </div>

      <Suspense fallback={<Fallback />}>
        {result.payload && (
          <ApiKeysList
            data={result.payload}
            defaultPublicProjectId={defaultPublicProjectId}
          />
        )}
      </Suspense>
    </Container>
  );
}
