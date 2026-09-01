import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectRedirect({ params }: Props) {
  const { projectId } = await params;
  const locale = await getLocale();
  redirect({ href: `/projects/${projectId}`, locale });
}
