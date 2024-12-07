import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

import { Card } from '@ragenai/common-ui/Card';

import { PropsWihLocale } from '@/app/lib/types/types';
import { CreateApiKeyForm } from '@/app/components/ApiKeys/CreateApiKeyForm/CreateApiKeyForm';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'api-keys' });

  return {
    title: t('title-create'),
  };
}

export default async function CreateApiKeyPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  const t = await getTranslations('api-keys');

  return (
    <Card title={t('title-create')} size="full" className="mb-5">
      <CreateApiKeyForm />
    </Card>
  );
}
