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
    <div className="w-full h-full flex flex-col lg:flex-row items-center gap-4 lg:gap-0 mt-4 px-3">
      <div className="w-full lg:w-1/2 flex-none px-4 lg:px-0">
        <CTA />
        <img
          alt="support"
          src="https://images.unsplash.com/photo-1559136555-9303baea8ebd?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&crop=focalpoint&fp-x=.4&w=2560&h=3413&&q=80"
          className="w-full h-auto max-h-[500px] object-cover rounded-lg shadow-lg"
        />
      </div>
      <div className="w-full lg:w-1/2 flex lg:justify-end">
        <SupportForm />
      </div>
    </div>
  );
}
