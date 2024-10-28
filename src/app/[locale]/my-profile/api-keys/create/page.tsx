import Link from 'next/link';

import { Card } from '@salesyy/common-ui/Card';
import { getTranslations } from 'next-intl/server';
import { PropsWihLocale } from '@/app/lib/types/types';
import { ApiKeysSynchronizer } from '@/app/components/ApiKeys/ApiKeysSynchronizer/ApiKeysSynchronizer';
import { Suspense } from 'react';
import { Fallback } from '@/app/components/Fallback';
import * as CommonUi from '@salesyy/common-ui';
import { CreateApiKeyForm } from '@/app/components/ApiKeys/CreateApiKeyForm/CreateApiKeyForm';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'api-keys' });

  return {
    title: t('title-create'),
  };
}

export default async function CreateApiKeyPage() {
  const t = await getTranslations('api-keys');

  return (
    <Card title={t('title-create')} size="full" className="mb-5">
      <Suspense fallback={<Fallback />}>
        <ApiKeysSynchronizer>
          <div className="flex w-full flex-col">
            <div className="mt-4">
              <CreateApiKeyForm />
            </div>
          </div>
        </ApiKeysSynchronizer>
      </Suspense>
    </Card>
  );
}
