import { getTranslations } from 'next-intl/server';
import { getLeadLists } from '@/app/actions/leads';
import type { PropsWihLocale } from '@/app/lib/types/types';
import { LeadsListPage } from './components/LeadsListPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('leads.title') };
}

export default async function Page() {
  const lists = await getLeadLists();
  return <LeadsListPage lists={lists} />;
}
