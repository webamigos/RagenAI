import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { PropsWihLocale } from '@/app/lib/types/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:documents-list.title'),
  };
}

export default function AdminPage() {
  redirect('/settings/knowledge/documents-list');
}
