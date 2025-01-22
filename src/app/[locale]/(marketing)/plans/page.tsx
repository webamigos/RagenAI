import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SubscriptionPlans } from './components/subscription-plans';
import { Suspense } from 'react';
import { Fallback } from '@/app/components/Fallback';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('plans.title'),
  };
}

export default async function PlansPage({ params: { locale } }: Props) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'plans' });

  return (
    <div className="pt-5 pl-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <Suspense fallback={<Fallback />}>
        <SubscriptionPlans />
      </Suspense>
    </div>
  );
}
