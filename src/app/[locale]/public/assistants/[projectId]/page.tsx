import { setRequestLocale } from 'next-intl/server';
import { getPublicProjectQuery as getPublicProject } from '@/features/projects/services/queries/get-project-query';
import { notFound } from 'next/navigation';

import { PublicStart } from '../../components/public-start';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    locale: string;
    projectId: string;
  }>;
  searchParams: Promise<{
    widgetMode?: boolean;
  }>;
};

export async function generateMetadata() {
  return {
    title: 'Publiczny chatbot',
  };
}

export default async function Index({ params, searchParams }: Props) {
  const { locale, projectId } = await params;
  const { widgetMode } = await searchParams;
  setRequestLocale(locale);

  // Get public project using accessToken (projectId in URL is actually the access token)
  const projectData = await getPublicProject(projectId);

  if (!projectData) {
    notFound();
  }

  return (
    <div>
      <div className="container mx-auto h-full">
        <PublicStart
          organizationId={projectData.organizationId}
          projectId={projectData.projectId}
          accessToken={projectId}
          widgetMode={widgetMode}
        />
      </div>
    </div>
  );
}
