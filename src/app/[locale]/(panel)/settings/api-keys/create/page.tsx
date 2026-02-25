import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import {
  getCurrentUser,
  getOrgIdFromAuthOrThrow,
} from '@/app/lib/utils/auth-helpers';

import { Container } from '@ragenai/common-ui/Container';
import { Header } from '@ragenai/common-ui/Header';

import { PropsWihLocale } from '@/app/lib/types/types';
import { CreateApiKeyForm } from '@/app/components/ApiKeys/CreateApiKeyForm/CreateApiKeyForm';
import { getUserProjectsQuery as fetchProjectsForUser } from '@/features/projects/services/queries/get-user-projects-query';
import { logger } from '@/app/lib/utils/logger';
import { getDefaultProjectPublicId } from '@/app/actions';

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

  const user = await getCurrentUser();
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId || !user?.id) {
    logger.error('Organization or user not found in API keys creation form!');
    throw new Error('Organization or user not found!');
  }
  const userProjects = await fetchProjectsForUser(orgId, user.id);
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
