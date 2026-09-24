import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isUuid } from '@/libs/utils/is-uuid';
import { ProjectComponent } from './ProjectComponent';

type Props = {
  params: Promise<{
    locale: string;
    projectId: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('projects.title') };
}

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;
  if (!isUuid(projectId)) {
    notFound();
  }

  return <ProjectComponent projectId={projectId} />;
}
