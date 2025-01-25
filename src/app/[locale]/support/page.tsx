import Image from 'next/image';

import { SupportForm } from '@/app/components/Support/SupportForm';
import { PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';

import { CTA } from '@/app/components/Support/CTA';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('support-page.title'),
  };
}

export default function SupportPage() {
  return (
    <div className="w-full h-full flex flex-col lg:flex-row items-center gap-4 lg:gap-0 mt-4 px-3 lg:px-0 lg:pr-2">
      <CTA />
      <SupportForm />
    </div>
  );
}
