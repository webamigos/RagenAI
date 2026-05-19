import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getLeadList, getActiveEnrichmentJob } from '@/app/actions/leads';
import type { PropsWihLocale } from '@/app/lib/types/types';
import { LeadsDetailPage } from '../components/LeadsDetailPage';

export const dynamic = 'force-dynamic';

type Params = PropsWihLocale & {
  params: Promise<{ locale: string; publicId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
};

export async function generateMetadata({ params }: Params) {
  const { locale, publicId } = await params;
  const [t, list] = await Promise.all([
    getTranslations({ locale, namespace: 'Metadata' }),
    getLeadList(publicId).catch(() => null),
  ]);
  if (!list) {
    return { title: t('leads.title') };
  }
  return { title: t('leads-detail.title', { name: list.name }) };
}

export default async function Page({ params, searchParams }: Params) {
  const { publicId } = await params;
  const { page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const pageSize = [25, 50, 100, 250, 500].includes(
    parseInt(pageSizeParam ?? '', 10),
  )
    ? parseInt(pageSizeParam!, 10)
    : 100;

  const [list, activeJob] = await Promise.all([
    getLeadList(publicId, { page, pageSize }),
    getActiveEnrichmentJob({ leadListPublicId: publicId }).catch(() => null),
  ]);
  if (!list) {
    notFound();
  }
  return <LeadsDetailPage list={list} activeJob={activeJob} />;
}
