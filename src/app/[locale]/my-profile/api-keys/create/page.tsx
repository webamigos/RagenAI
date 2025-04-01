import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';

import { Card } from '@ragenai/common-ui/Card';

import { PropsWihLocale } from '@/app/lib/types/types';
import { CreateApiKeyForm } from '@/app/components/ApiKeys/CreateApiKeyForm/CreateApiKeyForm';
import { fetchProjectsForUser } from '@/app/lib/services/project';
import { logger } from '@/app/lib/utils/logger';

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
  const { orgId, userId } = auth();
  if (!orgId) {
    logger.error('Organization not found in API keys creation form!');
    throw new Error('Organization not found!');
  }
  const userProjects = await fetchProjectsForUser(orgId, userId);
  const t = await getTranslations('api-keys');

  return (
    <Card title={t('title-create')} size="full" className="mb-5">
      <CreateApiKeyForm projects={userProjects} />
    </Card>
  );
}
