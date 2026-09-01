import { getTranslations } from 'next-intl/server';
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
  return { title: t('project-detail.title', { title: 'Project' }) };
}

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;

  return <ProjectComponent projectId={projectId} />;
}
