import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';

import { Container } from '@ragenai/common-ui';

import { PropsWihLocale } from '@/app/lib/types/types';
import { CreateApiKeyForm } from '@/app/components/ApiKeys/CreateApiKeyForm/CreateApiKeyForm';
import { fetchProjectsForUser } from '@/app/lib/services/project';
import { logger } from '@/app/lib/utils/logger';
import { getDefaultProjectPublicId } from '@/app/actions';
import { Header } from '@ragenai/common-ui';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'api-keys' });

  return {
    title: t('title-create'),
  };
}

export default async function CreateApiKeyPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { orgId, userId } = await auth();
  if (!orgId) {
    logger.error('Organization not found in API keys creation form!');
    throw new Error('Organization not found!');
  }
  const userProjects = await fetchProjectsForUser(orgId, userId);
  const defaultPublicProjectId = await getDefaultProjectPublicId();
  const t = await getTranslations('api-keys');

  return (
    // <Card title={t('title-create')} size="full" className="mb-5">
    <Container>
      <Header>{t('title-create')}</Header>
      <CreateApiKeyForm
        defaultPublicProjectId={defaultPublicProjectId}
        projects={userProjects}
      />
    </Container>
    // </Card>
  );
}
