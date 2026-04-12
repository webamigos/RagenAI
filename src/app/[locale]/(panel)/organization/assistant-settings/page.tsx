import { getTranslations } from 'next-intl/server';

import type { PropsWihLocale } from '@/app/lib/types/types';

import PromptManagementPage from './PromptManagementPageWrapper';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('prompt-management.title'),
  };
}

export default async function PromptManagementPageWrapper() {
  return <PromptManagementPage />;
}
