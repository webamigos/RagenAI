import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getLeadList, getActiveEnrichmentJob } from '@/app/actions/leads';
import type { PropsWihLocale } from '@/app/lib/types/types';
import { LeadsDetailPage } from '../components/LeadsDetailPage';

export const dynamic = 'force-dynamic';

type Params = PropsWihLocale & {
  params: Promise<{ locale: string; publicId: string }>;
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

export default async function Page({ params }: Params) {
  const { publicId } = await params;
  const [list, activeJob] = await Promise.all([
    getLeadList(publicId),
    getActiveEnrichmentJob({ leadListPublicId: publicId }).catch(() => null),
  ]);
  if (!list) {
    notFound();
  }
  return <LeadsDetailPage list={list} activeJob={activeJob} />;
}
