import { getSubscriptionData } from './actions';
import { SubscriptionInfo } from './components/SubscribtionInfo';
import { CreditsCard } from './components/CreditsCard';
import { getCreditsSummary } from '@/app/actions/credits';
import { getTranslations } from 'next-intl/server';
import type { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('subscription.title') };
}

export default async function SubscriptionPage() {
  const [subscription, creditsSummary] = await Promise.all([
    getSubscriptionData(),
    getCreditsSummary(),
  ]);
  const t = await getTranslations('subscription');

  if (!subscription) {
    return (
      <div className="max-w-2xl space-y-6">
        <CreditsCard summary={creditsSummary} />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('no-subscription')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <CreditsCard summary={creditsSummary} />
      <SubscriptionInfo subscription={subscription} />
    </div>
  );
}
