import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { PropsWihLocale } from '@/app/lib/types/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge.title'),
  };
}

export default function AdminPage() {
  redirect('/manage-knowledge/create-document');
}
