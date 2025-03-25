import { getTranslations } from 'next-intl/server';

import type { PropsWihLocale } from '@/app/lib/types/types';

import PromptManagementPage from './PromptManagementPageWrapper';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('prompt-management.title'),
  };
}

const FEATURE_FLAG_SHOW_MODEL_API_KEY =
  !!process.env.FEATURE_FLAG_SHOW_MODEL_API_KEY;
const FEATURE_FLAG_MODEL_SELECT = !!process.env.FEATURE_FLAG_MODEL_SELECT;

export default async function PromptManagementPageWrapper() {
  return (
    <PromptManagementPage
      showModelApiKey={FEATURE_FLAG_SHOW_MODEL_API_KEY}
      showModelSelect={FEATURE_FLAG_MODEL_SELECT}
    />
  );
}
