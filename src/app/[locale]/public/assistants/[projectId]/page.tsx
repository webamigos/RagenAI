import { setRequestLocale } from 'next-intl/server';
import { getPublicProject } from '@/app/lib/services/project';
import { notFound } from 'next/navigation';

import { PublicStart } from '../../components/public-start';

type Props = {
  params: {
    locale: string;
    projectId: string;
  };
  searchParams: {
    widgetMode?: boolean;
  };
};

export async function generateMetadata({
  params: { locale, projectId },
}: Props) {
  return {
    title: 'Publiczny chatbot',
  };
}

export default async function Index({
  params: { locale, projectId },
  searchParams,
}: Props) {
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
          widgetMode={searchParams.widgetMode}
        />
      </div>
    </div>
  );
}
