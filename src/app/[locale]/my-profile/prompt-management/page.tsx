import { getTranslations } from 'next-intl/server';

import type { PropsWihLocale } from '@/app/lib/types/types';

import PromptManagementPage from './PromptManagementPageWrapper';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('prompt-management.title'),
  };
}

export default function PromptManagementPageWrapper() {
  return <PromptManagementPage />;
}
